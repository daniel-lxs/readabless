import { Argon2id } from 'oslo/password';
import { generateId } from 'lucia';
import { z } from 'zod';
import type { LoginResult } from '@/types/auth/LoginResult';
import type { SignupResult } from '@/types/auth/SignupResult';
import type { ValidationResult } from '@/types/auth/ValidationResult';
import { findByUsername, create as createUser } from '@/server/data/repositories/user.repository';
import { createBoard } from './board.service';
import { createFeed } from './feed.service';

const validateUserForm = z.object({
  username: z
    .string()
    .regex(/^[a-z0-9_-]+$/i, 'Username must only consist of lowercase letters, 0-9, -, and _')
    .min(4, 'Username must be between 4 ~ 31 characters')
    .max(31, 'Username must be between 4 ~ 31 characters'),
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(255, 'Password too long')
});

const validateUser = async (username: string, password: string): Promise<ValidationResult> => {
  const result = validateUserForm.safeParse({ username, password });
  if (!result.success) {
    return {
      success: false,
      errors: result.error.formErrors.fieldErrors
    };
  }
  return { success: true };
};

const login = async (username: string, password: string): Promise<LoginResult> => {
  const validation = await validateUser(username, password);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  const existingUser = await findByUsername(username);

  // Simulate a delay to prevent timing attacks
  //TODO: Replace with a better solution
  await new Promise((resolve) => setTimeout(resolve, 1000));

  if (!existingUser) {
    return {
      success: false,
      errors: {
        username: ['Invalid username or password']
      }
    };
  }

  const validPassword = await new Argon2id().verify(existingUser.hashedPassword, password);
  if (!validPassword) {
    return {
      success: false,
      errors: {
        username: ['Invalid username or password']
      }
    };
  }

  return {
    success: true,
    user: existingUser
  };
};

const signup = async (username: string, password: string): Promise<SignupResult> => {
  const validation = await validateUser(username, password);
  if (!validation.success) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  const existingUser = await findByUsername(username);

  if (existingUser) {
    return {
      success: false,
      errors: {
        username: ['Username already taken']
      }
    };
  }

  const hashedPassword = await new Argon2id().hash(password);
  const userId = generateId(15);

  await createUser({
    id: userId,
    username,
    hashedPassword
  });

  // Create a default board for the user
  const defaultBoard = await createBoard('My Board', userId, true);

  if (!defaultBoard) {
    console.error('Error creating default board');
    return {
      success: false,
      errors: {
        board: ['Failed to create default board']
      }
    };
  }

  // Create a default feed for saved articles
  const defaultFeed = await createFeed({
    name: 'Saved Articles',
    description: 'Articles you have saved',
    link: `default-feed-${userId}`,
    boardId: defaultBoard?.id
  });

  if (!defaultFeed) {
    console.error('Error creating default feed');
    return {
      success: false,
      errors: {
        feed: ['Failed to create default feed']
      }
    };
  }

  return {
    success: true,
    userId
  };
};

export default {
  validateUser,
  login,
  signup
};

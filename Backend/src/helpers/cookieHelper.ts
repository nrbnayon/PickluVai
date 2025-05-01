import config from '../config';
import { Response, CookieOptions } from 'express';

// Define base cookie options type
interface BaseCookieOptions extends CookieOptions {
  httpOnly: boolean;
  secure: boolean;
  sameSite?: 'none' | 'lax' | 'strict';
  path: string;
  domain?: string;
  maxAge: number;
}

// Create base options function to reduce duplication
const getBaseOptions = (): Omit<BaseCookieOptions, 'maxAge'> => {
  const options = {
    httpOnly: config.cookies.httpOnly,
    secure: config.cookies.secure,
    sameSite: config.cookies.sameSite as 'none' | 'lax' | 'strict' | undefined,
    path: config.cookies.path,
  };

  if (config.cookies.domain) {
    return { ...options, domain: config.cookies.domain };
  }

  return options;
};

export const cookieHelper = {
  getAccessTokenOptions: (): BaseCookieOptions => ({
    ...getBaseOptions(),
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  }),

  getRefreshTokenOptions: (): BaseCookieOptions => ({
    ...getBaseOptions(),
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  }),
};

export const safeCookie = {
  set: (
    res: Response,
    name: string,
    value: string,
    options: BaseCookieOptions
  ): void => {
    try {
      res.cookie(name, value, options);
      console.log(`Cookie '${name}' set successfully`);
    } catch (error) {
      console.error(
        `Failed to set cookie '${name}':`,
        error instanceof Error ? error.message : String(error)
      );

      try {
        const simpleOptions: BaseCookieOptions = { ...options };
        delete simpleOptions.domain;
        res.cookie(name, value, simpleOptions);
        console.log(`Cookie '${name}' set with fallback options`);
      } catch (fallbackError) {
        console.error(
          `Critical: Failed to set cookie '${name}' even with fallback:`,
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        );
      }
    }
  },

  clear: (res: Response, name: string, options: BaseCookieOptions): void => {
    try {
      res.clearCookie(name, options);
      console.log(`Cookie '${name}' cleared successfully`);
    } catch (error) {
      console.error(
        `Failed to clear cookie '${name}':`,
        error instanceof Error ? error.message : String(error)
      );

      try {
        const simpleOptions: BaseCookieOptions = { ...options };
        delete simpleOptions.domain;
        res.clearCookie(name, simpleOptions);
        console.log(`Cookie '${name}' cleared with fallback options`);
      } catch (fallbackError) {
        console.error(
          `Critical: Failed to clear cookie '${name}' even with fallback:`,
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        );
      }
    }
  },
};

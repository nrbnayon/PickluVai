// src/helpers/jwtHelper.ts
import jwt, {  SignOptions } from 'jsonwebtoken';
import config from '../config';
import ApiError from '../errors/ApiError';
import { StatusCodes } from 'http-status-codes';

interface TokenPayload {
  userId: string;
  role: string;
  email?: string;
  name?: string;
  authProvider?:string;
}

const createToken = (
  payload: TokenPayload,
  secret: string,
  expireTime: any
): string => {
  const options: SignOptions = { expiresIn: expireTime };
  return jwt.sign(payload, secret, options);
};

const verifyToken = <T extends object>(token: string, secret: string): T => {
  try {
    return jwt.verify(token, secret) as T;
  } catch (error) {
    throw new ApiError(StatusCodes.UNAUTHORIZED, 'Invalid token');
  }
};

const createAccessToken = (payload: TokenPayload): string => {
  if (!config.jwt.secret) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'JWT secret is not defined'
    );
  }
  return createToken(payload, config.jwt.secret, config.jwt.expire_in);
};

const createRefreshToken = (payload: TokenPayload): string => {
  if (!config.jwt.refresh_secret) {
    throw new ApiError(
      StatusCodes.INTERNAL_SERVER_ERROR,
      'JWT refresh secret is not defined'
    );
  }
  return createToken(
    payload,
    config.jwt.refresh_secret,
    config.jwt.refresh_expires_in
  );
};

export const jwtHelper = {
  createToken,
  verifyToken,
  createAccessToken,
  createRefreshToken,
};

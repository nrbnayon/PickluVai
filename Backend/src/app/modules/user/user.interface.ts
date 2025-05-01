// src\app\modules\user\user.interface.ts
import { Document, Model } from 'mongoose';
import {
  AUTH_PROVIDER,
  USER_GENDER,
  USER_PLAN,
  USER_ROLES,
  USER_STATUS,
} from '../../../enums/common';

export type IUserSubscription = {
  plan: USER_PLAN;
  startDate: Date;
  endDate: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  dailyRequests: number;
  dailyTokens: number;
  lastRequestDate?: Date;
  status: 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  autoRenew: boolean;
};

export interface IUser extends Document {
  _id: string;
  role: USER_ROLES;
  name: string;
  email: string;
  authProvider: AUTH_PROVIDER;
  image?: string;
  phone?: string;
  password?: string;
  address?: string;
  googleId?: string;
  microsoftId?: string;
  yahooId?: string;
  googleAccessToken?: string;
  microsoftAccessToken?: string;
  yahooAccessToken?: string;
  refreshToken?: string;
  country?: string;
  status: USER_STATUS;
  verified: boolean;
  gender: USER_GENDER;
  dateOfBirth: Date;
  isActive?: boolean;
  lastActiveAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
  lastSync: Date;
  subscription: IUserSubscription;
}

export interface ILoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: USER_ROLES;
    image?: string;
  };
}

export interface IOAuthLoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: USER_ROLES;
    image?: string;
  };
}

export type UserModel = {
  isExistUserById(id: string): Promise<IUser | null>;
  isExistUserByEmail(email: string): Promise<IUser | null>;
  isExistUserByProvider(
    provider: AUTH_PROVIDER,
    providerId: string
  ): Promise<IUser | null>;
} & Model<IUser>;

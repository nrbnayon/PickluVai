// src\app\modules\auth\auth.model.ts
import { Schema, model } from 'mongoose';
import { AUTH_PROVIDER, USER_ROLES, USER_STATUS } from '../../../enums/common';

const userSchema = new Schema({
  phoneNumber: { type: String, unique: true, required: true },
  isOtpVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpires: { type: Date },
  otpAttempts: { type: Number, default: 0 },
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.USER,
  },
  authProvider: {
    type: String,
    enum: Object.values(AUTH_PROVIDER),
    default: AUTH_PROVIDER.LOCAL,
  },
  status: {
    type: String,
    enum: Object.values(USER_STATUS),
    default: USER_STATUS.PENDING,
  },
  email: { type: String },
  name: { type: String },
});

export const User = model('User', userSchema);
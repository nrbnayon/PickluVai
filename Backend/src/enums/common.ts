// src\enums\common.ts

export enum USER_ROLES {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum AUTH_PROVIDER {
  SOCIAL = 'social', // Social login (Google, Facebook, etc.)
  LOCAL = 'local', // Local email/password or phone/password login
}

export enum USER_STATUS {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
  DEACTIVATE = 'DEACTIVATE',
  DELETE = 'DELETE',
  BLOCK = 'BLOCK',
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
}

export enum USER_GENDER {
  MALE = 'male',
  FEMALE = 'female',
  BOTH = 'both',
  OTHERS = 'others',
}

export enum USER_PLAN {
  FREE = 'free',
  BASIC = 'basic',
  PREMIUM = 'premium',
  ENTERPRISE = 'enterprise',
}

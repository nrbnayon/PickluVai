// src\enums\common.ts
export enum USER_ROLES {
  ADMIN = 'ADMIN',
  USER = 'USER',
}

export enum AUTH_PROVIDER {
  GOOGLE = 'google', // gmail
  MICROSOFT = 'microsoft', // outlook
  YAHOO = 'yahoo', // yahoo
  LOCAL = 'local', // Local email/password login
}

export enum USER_STATUS {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
  DEACTIVATE = 'deactivate',
  DELETE = 'delete',
  BLOCK = 'block',
  PENDING = 'pending',
  APPROVED = 'approved',
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

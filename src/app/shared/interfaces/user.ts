export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
  roleId: number;
  preferredLocation?: string;
  jobType?: string;
  skillIds?: number[];
  jobs?: JobDto[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  userId: number;
  fullName: string;
  email: string;
  roleId: number;
  token: string;
}

export interface RoleDto {
  roleId: number;
  roleName: string;
}

export interface SkillDto {
  skillId: number;
  skillName: string;
}

export interface RegisterDropdownResponse {
  roles: RoleDto[];
  skills: SkillDto[];
  jobTypes: string[];
  locations: string[];
}

export interface JobDto {
  title: string;
  description: string;
  jobType: string;
  location: string;
  experienceRequired: string;
  salary: string;
}

// Chat-related interfaces
export interface ChatMessage {
  messageId: number;
  senderId: number;
  receiverId: number;
  message: string;
  timestamp: Date;
  isRead: boolean;
}

export interface ChatUser {
  userId: number;
  fullName: string;
  email: string;
  lastMessage?: string;
  lastMessageTime?: Date;
  unreadCount?: number;
  isOnline?: boolean;
  isApplicant?: boolean;
  applicationStatus?: string;
  applicationId?: number;
  appliedDate?: Date;
  remarks?: string;
}

export interface SendMessageRequest {
  senderId: number;
  receiverId: number;
  messageText: string;
  sentAt: Date;
}

export interface MarkAsReadRequest {
  senderId: number;
  receiverId: number;
}

export interface TypingNotificationRequest {
  senderId: number;
  receiverId: number;
  isTyping: boolean;
}

export interface MessageNotification {
  messageId: number;
  senderId: number;
  receiverId: number;
  message: string;
  timestamp: Date;
  type: string;
}

export interface TypingNotification {
  senderId: number;
  receiverId: number;
  isTyping: boolean;
  timestamp: Date;
}

export interface UserStatusUpdate {
  userId: number;
  isOnline: boolean;
  lastSeen: Date;
}

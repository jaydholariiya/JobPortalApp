import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { JobSignalRService } from './signalr.service';
import {
  SendMessageRequest,
  MarkAsReadRequest
} from '../interfaces/user';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private currentUserId: number | null = null;

  constructor(
    private apiService: ApiService,
    private signalRService: JobSignalRService
  ) { }

  // Observable streams from SignalR service
  public get messageReceived$() {
    return this.signalRService.messageReceived$;
  }

  public get messageNotification$() {
    return this.signalRService.messageNotification$;
  }

  public get typingNotification$() {
    return this.signalRService.typingNotification$;
  }

  public get messagesMarkedAsRead$() {
    return this.signalRService.messagesMarkedAsRead$;
  }

  public get userStatusUpdate$() {
    return this.signalRService.userStatusUpdate$;
  }

  // Initialize chat for a user
  public async initializeChat(userId: number): Promise<void> {
    this.currentUserId = userId;
    
    try {
      // Join user-specific group for notifications via main SignalR service
      await this.signalRService.joinUserGroups(userId, 0); // Assuming roleId will be handled elsewhere
      
      // Update user status to online
      await this.signalRService.updateOnlineStatus(userId, true);
      
      console.log(`✅ Chat initialized for user ${userId}`);
    } catch (error) {
      console.error('❌ Error initializing chat:', error);
    }
  }

  // Join a specific chat room
  public async joinChatRoom(senderId: number, receiverId: number): Promise<void> {
    return this.signalRService.joinChatRoom(senderId, receiverId);
  }

  // Leave a specific chat room
  public async leaveChatRoom(senderId: number, receiverId: number): Promise<void> {
    return this.signalRService.leaveChatRoom(senderId, receiverId);
  }

  // Send a message via API (which will trigger SignalR notification)
  public sendMessage(request: SendMessageRequest): Observable<any> {
    return this.apiService.post('Messages', {
      senderId: request.senderId,
      receiverId: request.receiverId,
      messageText: request.messageText,
      sentAt: request.sentAt
    });
  }

  // Send typing notification via SignalR
  public async sendTypingNotification(senderId: number, receiverId: number, isTyping: boolean): Promise<void> {
    return this.signalRService.sendTypingNotification(senderId, receiverId, isTyping);
  }

  // Mark messages as read
  public markMessagesAsRead(request: MarkAsReadRequest): Observable<any> {
    return this.apiService.post('Messages/mark-read', request);
  }

  // Get conversation between two users
  public getConversation(userId1: number, userId2: number): Observable<any> {
    return this.apiService.get(`Messages/${userId1}/${userId2}`);
  }

  // Get unread message count
  public getUnreadMessageCount(userId: number): Observable<any> {
    return this.apiService.get(`Messages/unread-count/${userId}`);
  }

  // Update user online status
  public async updateOnlineStatus(userId: number, isOnline: boolean): Promise<void> {
    return this.signalRService.updateOnlineStatus(userId, isOnline);
  }

  // Disconnect from chat
  public async disconnect(): Promise<void> {
    try {
      if (this.currentUserId) {
        await this.updateOnlineStatus(this.currentUserId, false);
      }
      console.log('✅ Chat disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting chat:', error);
    }
  }

  // Get connection state
  public getConnectionState() {
    return this.signalRService.getConnectionState();
  }

  // Check if connected
  public isConnected(): boolean {
    return this.signalRService.isConnected();
  }
}

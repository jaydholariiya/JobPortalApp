import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class JobSignalRService {
  private hubConnection: signalR.HubConnection;
  private currentUserId: number | null = null;
  private currentUserRole: number | null = null;

  // Chat-related subjects
  private messageReceivedSubject = new Subject<any>();
  private messageNotificationSubject = new Subject<any>();
  private typingNotificationSubject = new Subject<any>();
  private messagesMarkedAsReadSubject = new Subject<any>();
  private userStatusUpdateSubject = new Subject<any>();

  // Observables for chat events
  public messageReceived$ = this.messageReceivedSubject.asObservable();
  public messageNotification$ = this.messageNotificationSubject.asObservable();
  public typingNotification$ = this.typingNotificationSubject.asObservable();
  public messagesMarkedAsRead$ = this.messagesMarkedAsReadSubject.asObservable();
  public userStatusUpdate$ = this.userStatusUpdateSubject.asObservable();

  constructor() {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl('https://localhost:7151/jobhub')
      .withAutomaticReconnect()
      .build();

    this.startConnection();
    this.setupChatListeners();
  }

  private startConnection() {
    this.hubConnection.start()
      .then(() => {
        console.log('✅ SignalR Connection started');
        if (this.currentUserId && this.currentUserRole) {
          this.joinUserGroups(this.currentUserId, this.currentUserRole);
        }
      })
      .catch(err => {
        console.error('❌ SignalR Connection failed:', err);
        // Retry connection after 5 seconds
        setTimeout(() => this.startConnection(), 5000);
      });
  }

  private setupChatListeners() {
    // Listen for incoming messages
    this.hubConnection.on('ReceiveMessage', (data: any) => {
      this.messageReceivedSubject.next({
        messageId: data.messageId,
        senderId: data.senderId,
        receiverId: data.receiverId,
        message: data.message,
        timestamp: new Date(data.timestamp),
        isRead: data.isRead || false
      });
    });

    // Listen for message notifications
    this.hubConnection.on('ReceiveMessageNotification', (data: any) => {
      this.messageNotificationSubject.next({
        messageId: data.messageId,
        senderId: data.senderId,
        receiverId: data.receiverId,
        message: data.message,
        timestamp: new Date(data.timestamp),
        type: data.type
      });
    });

    // Listen for typing notifications
    this.hubConnection.on('UserTyping', (data: any) => {
      this.typingNotificationSubject.next({
        senderId: data.senderId,
        receiverId: data.receiverId,
        isTyping: data.isTyping,
        timestamp: new Date(data.timestamp)
      });
    });

    // Listen for messages marked as read
    this.hubConnection.on('MessagesMarkedAsRead', (data: any) => {
      this.messagesMarkedAsReadSubject.next({
        senderId: data.senderId,
        receiverId: data.receiverId,
        timestamp: new Date(data.timestamp)
      });
    });

    // Listen for user status updates
    this.hubConnection.on('UserStatusUpdate', (data: any) => {
      this.userStatusUpdateSubject.next({
        userId: data.userId,
        isOnline: data.isOnline,
        lastSeen: new Date(data.lastSeen)
      });
    });
  }

  public async joinUserGroups(userId: number, roleId: number) {
    try {
      if (this.hubConnection.state !== signalR.HubConnectionState.Connected) {
        await this.waitForConnection();
      }

      this.currentUserId = userId;
      this.currentUserRole = roleId;
      
      await this.hubConnection.invoke('JoinUserGroup', userId.toString());
      
      if (roleId === 1) {
        await this.hubConnection.invoke('JoinAdminGroup');
      } else {
        await this.hubConnection.invoke('JoinRegularUsersGroup');
      }
      
    } catch (error) {
    }
  }

  private async waitForConnection(maxRetries: number = 10): Promise<void> {
    let retries = 0;
    
    while (this.hubConnection.state !== signalR.HubConnectionState.Connected && retries < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 500));
      retries++;
    }
    
    if (this.hubConnection.state !== signalR.HubConnectionState.Connected) {
      throw new Error('SignalR connection failed to establish after retries');
    }
  }

  public async leaveUserGroups() {
    try {
      if (this.currentUserId) {
        await this.hubConnection.invoke('LeaveUserGroup', this.currentUserId.toString());
      }
      if (this.currentUserRole === 1) {
        await this.hubConnection.invoke('LeaveAdminGroup');
      } else {
        await this.hubConnection.invoke('LeaveRegularUsersGroup');
      }
      
      this.currentUserId = null;
      this.currentUserRole = null;
    } catch (error) {
    }
  }

  public onJobChange(callback: (data: any) => void) {
    this.hubConnection.on('ReceiveJobChange', (data: any) => {
      callback(data);
    });
  }

  public onStatusUpdate(callback: (data: any) => void) {
    this.hubConnection.on('ReceiveStatusUpdate', (data: any) => {
      callback(data);
    });
  }

  public offJobChange() {
    this.hubConnection.off('ReceiveJobChange');
  }

  public offStatusUpdate() {
    this.hubConnection.off('ReceiveStatusUpdate');
  }

  public disconnect() {
    this.leaveUserGroups().then(() => {
      this.hubConnection.stop();
    });
  }

  public getConnectionState() {
    return this.hubConnection.state;
  }

  public isConnected(): boolean {
    return this.hubConnection.state === signalR.HubConnectionState.Connected;
  }

  public async ensureConnection(): Promise<void> {
    if (this.hubConnection.state === signalR.HubConnectionState.Disconnected) {
      await this.hubConnection.start();
    }
  }

  public getCurrentUserInfo() {
    return {
      userId: this.currentUserId,
      roleId: this.currentUserRole,
      connectionState: this.hubConnection.state,
      isConnected: this.isConnected()
    };
  }

  // Chat-specific methods
  public async joinChatRoom(senderId: number, receiverId: number): Promise<void> {
    try {
      if (this.hubConnection.state !== signalR.HubConnectionState.Connected) {
        await this.waitForConnection();
      }

      await this.hubConnection.invoke('JoinChatRoom', senderId.toString(), receiverId.toString());
      console.log(`💬 Joined chat room between ${senderId} and ${receiverId}`);
    } catch (error) {
      console.error('❌ Error joining chat room:', error);
    }
  }

  public async leaveChatRoom(senderId: number, receiverId: number): Promise<void> {
    try {
      await this.hubConnection.invoke('LeaveChatRoom', senderId.toString(), receiverId.toString());
      console.log(`💬 Left chat room between ${senderId} and ${receiverId}`);
    } catch (error) {
      console.error('❌ Error leaving chat room:', error);
    }
  }

  public async sendTypingNotification(senderId: number, receiverId: number, isTyping: boolean): Promise<void> {
    try {
      if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
        await this.hubConnection.invoke('NotifyTyping', senderId.toString(), receiverId.toString(), isTyping);
      }
    } catch (error) {
      console.error('❌ Error sending typing notification:', error);
    }
  }

  public async updateOnlineStatus(userId: number, isOnline: boolean): Promise<void> {
    try {
      if (this.hubConnection.state === signalR.HubConnectionState.Connected) {
        await this.hubConnection.invoke('UpdateOnlineStatus', userId.toString(), isOnline);
      }
    } catch (error) {
      console.error('❌ Error updating online status:', error);
    }
  }
}

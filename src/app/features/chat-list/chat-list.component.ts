import { Component, OnInit, Input, OnChanges, SimpleChanges, OnDestroy, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { MatBadgeModule } from '@angular/material/badge';
import { ApiService } from '../../core/services/api.service';
import { ChatService } from '../../shared/services/chat.service';
import { Subscription } from 'rxjs';

interface ChatUser {
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

interface ChatMessage {
  messageId: number;
  senderId: number;
  receiverId: number;
  message: string;
  timestamp: Date;
  isRead: boolean;
}

interface JobItem {
  jobId: number;
  title: string;
  description: string;
  location: string;
  jobType: string;
  experienceRequired: number;
  salary: number;
}

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatBadgeModule
  ],
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.scss']
})
export class ChatListComponent implements OnInit, OnChanges, OnDestroy, AfterViewInit {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @Input() selectedJob: JobItem | null = null;
  @Input() applications: any[] = [];

  filteredUsers: ChatUser[] = [];
  searchQuery: string = '';
  selectedUser: ChatUser | null = null;
  messages: ChatMessage[] = [];
  newMessage: string = '';
  currentUserId: number = 0;
  isTyping: boolean = false;
  typingUsers: Set<number> = new Set();
  private subscriptions: Subscription[] = [];
  private typingTimeout: any;

  constructor(
    private apiService: ApiService,
    private chatService: ChatService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) { }

  ngOnInit(): void {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    this.currentUserId = userData.data?.userId || 0;
    
    // Initialize chat service
    this.initializeChat();
    this.setupSignalRListeners();
    this.loadUsers();
  }

  ngAfterViewInit(): void {
    // Component view initialized - scroll chat if it's open
    if (this.selectedUser && this.messages.length > 0) {
      setTimeout(() => {
        this.scrollToBottom();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    // Clean up subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    
    // Clear typing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Leave current chat room if any
    if (this.selectedUser) {
      this.chatService.leaveChatRoom(this.currentUserId, this.selectedUser.userId);
    }
  }

  private async initializeChat(): Promise<void> {
    try {
      await this.chatService.initializeChat(this.currentUserId);
      console.log('✅ Chat initialized for user:', this.currentUserId);
    } catch (error) {
      console.error('❌ Failed to initialize chat:', error);
    }
  }

  private setupSignalRListeners(): void {
    // Listen for incoming messages
    const messageSubscription = this.chatService.messageReceived$.subscribe(message => {
      if ((message.senderId === this.selectedUser?.userId && message.receiverId === this.currentUserId) ||
          (message.senderId === this.currentUserId && message.receiverId === this.selectedUser?.userId)) {
        
        // Check for duplicates before adding
        const existingMessage = this.messages.find(msg => 
          msg.messageId === message.messageId || 
          (msg.senderId === message.senderId && 
           msg.message === message.message && 
           Math.abs(new Date(msg.timestamp).getTime() - new Date(message.timestamp).getTime()) < 5000)
        );
        
        if (!existingMessage) {
          this.messages.push(message);
          
          // Update UI and scroll
          this.cdr.detectChanges();
          
          setTimeout(() => {
            this.scrollToBottom();
          }, 150);
        }
        
        this.markMessagesAsReadAPI();
      }
      this.updateUserLastMessage(message);
    });

    // Listen for typing notifications
    const typingSubscription = this.chatService.typingNotification$.subscribe(notification => {
      if (notification.receiverId === this.currentUserId && 
          notification.senderId === this.selectedUser?.userId) {
        if (notification.isTyping) {
          this.typingUsers.add(notification.senderId);
        } else {
          this.typingUsers.delete(notification.senderId);
        }
      }
    });

    // Listen for user status updates
    const statusSubscription = this.chatService.userStatusUpdate$.subscribe(update => {
      const user = this.filteredUsers.find(u => u.userId === update.userId);
      if (user) {
        user.isOnline = update.isOnline;
      }
    });

    // Listen for messages marked as read
    const readSubscription = this.chatService.messagesMarkedAsRead$.subscribe(data => {
      if (data.senderId === this.currentUserId || data.receiverId === this.currentUserId) {
        this.messages.forEach(msg => {
          if (msg.senderId === data.senderId && msg.receiverId === data.receiverId) {
            msg.isRead = true;
          }
        });
      }
    });

    this.subscriptions.push(messageSubscription, typingSubscription, statusSubscription, readSubscription);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedJob'] || changes['applications']) {
      this.loadUsers();
    }
  }

  loadUsers(): void {
    this.filteredUsers = this.applications.map(app => ({
      userId: app.userId,
      fullName: app.userName,
      email: app.email,
      lastMessage: this.getStatusBasedMessage(app.status, app.remarks),
      lastMessageTime: new Date(app.appliedDate),
      unreadCount: 0, // Will be updated by real-time events
      isOnline: false, // Will be updated by real-time events
      isApplicant: true,
      applicationStatus: app.status,
      applicationId: app.applicationId,
      appliedDate: new Date(app.appliedDate),
      remarks: app.remarks
    }));

    // Load unread counts for each user
    this.loadUnreadCounts();
  }

  private loadUnreadCounts(): void {
    this.filteredUsers.forEach(user => {
      this.chatService.getUnreadMessageCount(this.currentUserId).subscribe({
        next: (response) => {
          // Note: This endpoint returns total unread count, you might need to modify 
          // your backend to return per-user unread counts
          if (response.success) {
            user.unreadCount = 0; // For now, we'll track this through real-time events
          }
        },
        error: (error) => {
          console.error('Failed to load unread count:', error);
        }
      });
    });
  }

  getStatusBasedMessage(status: string, remarks?: string): string {
    switch (status) {
      case 'Applied':
        return 'I have applied for this position. Looking forward to hearing from you!';
      case 'Reviewed':
        return remarks || 'Thank you for reviewing my application.';
      case 'Shortlisted':
        return 'Excited to be shortlisted! When can we schedule the next step?';
      case 'Rejected':
        return remarks || 'Thank you for the opportunity. I understand the decision.';
      case 'Hired':
        return 'Thank you for the opportunity! I\'m excited to join the team.';
      default:
        return 'Hello! I\'m interested in discussing this opportunity further.';
    }
  }

  filterUsers(): void {
    if (!this.searchQuery.trim()) {
      this.loadUsers();
    } else {
      this.filteredUsers = this.filteredUsers.filter(user =>
        user.fullName.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        user.applicationStatus?.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
  }

  selectUser(user: ChatUser): void {
    // Leave previous chat room if any
    if (this.selectedUser) {
      this.chatService.leaveChatRoom(this.currentUserId, this.selectedUser.userId);
    }

    this.selectedUser = user;
    this.loadMessages(user.userId);
    user.unreadCount = 0;

    // Join new chat room
    this.chatService.joinChatRoom(this.currentUserId, user.userId);
    
    // Scroll to bottom when user is selected
    setTimeout(() => {
      this.scrollToBottom();
    }, 600);
  }

  loadMessages(userId: number): void {
    // Load real messages from API
    this.chatService.getConversation(this.currentUserId, userId).subscribe({
      next: (response) => {
        if (response && response.length > 0) {
          this.messages = response.map((msg: any) => ({
            messageId: msg.messageId,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            message: msg.messageText,
            timestamp: new Date(msg.sentAt),
            isRead: msg.isRead
          }));
        } else {
          // Create initial conversation if no messages exist
          this.createInitialConversation(userId);
        }
        
        // Sort messages by timestamp and trigger UI update
        this.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        this.cdr.detectChanges();
        
        // Mark messages as read when loaded
        this.markMessagesAsReadAPI();
        
        // Scroll to bottom after loading
        setTimeout(() => {
          this.scrollToBottom();
        }, 200);
        
        setTimeout(() => {
          this.scrollToBottom();
        }, 500);
      },
      error: (error) => {
        console.error('Failed to load messages:', error);
        // Fallback to creating initial conversation
        this.createInitialConversation(userId);
      }
    });
  }

  private createInitialConversation(userId: number): void {
    const application = this.applications.find(app => app.userId === userId);
    
    this.messages = [
      {
        messageId: Date.now(),
        senderId: userId,
        receiverId: this.currentUserId,
        message: `Hello! I applied for the ${application?.jobTitle} position on ${this.formatDate(application?.appliedDate)}.`,
        timestamp: new Date(application?.appliedDate || Date.now() - 7200000),
        isRead: true
      },
      {
        messageId: Date.now() + 1,
        senderId: this.currentUserId,
        receiverId: userId,
        message: 'Thank you for your application! We have received it and will review it shortly.',
        timestamp: new Date(Date.now() - 7000000),
        isRead: true
      }
    ];

    if (application?.status !== 'Applied') {
      this.messages.push({
        messageId: Date.now() + 2,
        senderId: this.currentUserId,
        receiverId: userId,
        message: this.getStatusUpdateMessage(application?.status, application?.remarks),
        timestamp: new Date(Date.now() - 6800000),
        isRead: true
      });

      if (application?.status === 'Shortlisted') {
        this.messages.push({
          messageId: Date.now() + 3,
          senderId: userId,
          receiverId: this.currentUserId,
          message: 'Thank you for shortlisting me! I\'m very excited about this opportunity. When would be a good time for the next step?',
          timestamp: new Date(Date.now() - 6600000),
          isRead: true
        });
      }
    }
    
    // Sort messages and scroll
    this.messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    this.cdr.detectChanges();
    
    setTimeout(() => {
      this.scrollToBottom();
    }, 200);
  }

  private markMessagesAsReadAPI(): void {
    if (this.selectedUser) {
      this.chatService.markMessagesAsRead({
        senderId: this.selectedUser.userId,
        receiverId: this.currentUserId
      }).subscribe({
        next: () => {
          console.log('Messages marked as read');
        },
        error: (error) => {
          console.error('Failed to mark messages as read:', error);
        }
      });
    }
  }

  private updateUserLastMessage(message: ChatMessage): void {
    const user = this.filteredUsers.find(u => 
      u.userId === message.senderId || u.userId === message.receiverId
    );
    
    if (user && user.userId !== this.currentUserId) {
      user.lastMessage = message.message;
      user.lastMessageTime = message.timestamp;
      
      // Increment unread count if this user is not currently selected
      if (this.selectedUser?.userId !== user.userId && message.senderId === user.userId) {
        user.unreadCount = (user.unreadCount || 0) + 1;
      }
    }
  }

  getStatusUpdateMessage(status: string, remarks?: string): string {
    const baseMessage = `Your application status has been updated to: ${status}`;
    if (remarks) {
      return `${baseMessage}. Additional feedback: ${remarks}`;
    }
    return baseMessage;
  }

  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString();
  }

  getStatusColorClass(status: string): string {
    switch (status?.toLowerCase()) {
      case 'applied': return 'status-applied';
      case 'reviewed': return 'status-reviewed';
      case 'shortlisted': return 'status-shortlisted';
      case 'rejected': return 'status-rejected';
      case 'hired': return 'status-hired';
      default: return 'status-default';
    }
  }

  sendMessage(): void {
    if (!this.newMessage.trim() || !this.selectedUser) return;

    const messageRequest = {
      senderId: this.currentUserId,
      receiverId: this.selectedUser.userId,
      messageText: this.newMessage.trim(),
      sentAt: new Date()
    };

    // Send via API (which will trigger SignalR to all connected users)
    this.chatService.sendMessage(messageRequest).subscribe({
      next: (response) => {
        console.log('Message sent successfully:', response);
        // Message will be added to UI via SignalR event
        this.newMessage = '';
        this.stopTyping();
        
        // Scroll to bottom after a short delay in case SignalR doesn't trigger
        setTimeout(() => {
          this.scrollToBottom();
        }, 1000);
      },
      error: (error) => {
        console.error('Failed to send message:', error);
        // You could show an error message to the user here
      }
    });
  }

  onTyping(): void {
    if (!this.selectedUser) return;

    // Send typing notification
    this.chatService.sendTypingNotification(this.currentUserId, this.selectedUser.userId, true);

    // Clear existing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Set new timeout to stop typing after 3 seconds of inactivity
    this.typingTimeout = setTimeout(() => {
      this.stopTyping();
    }, 3000);
  }

  private stopTyping(): void {
    if (this.selectedUser) {
      this.chatService.sendTypingNotification(this.currentUserId, this.selectedUser.userId, false);
    }
    
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
      this.typingTimeout = null;
    }
  }

  isUserTyping(userId: number): boolean {
    return this.typingUsers.has(userId);
  }

  goBackToUserList(): void {
    // Leave current chat room
    if (this.selectedUser) {
      this.chatService.leaveChatRoom(this.currentUserId, this.selectedUser.userId);
    }
    
    this.selectedUser = null;
    this.messages = [];
    this.stopTyping();
  }

  formatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  }

  private scrollToBottom(): void {
    // Use ngZone to ensure this runs after Angular's change detection
    this.ngZone.run(() => {
      setTimeout(() => {
        this.forceScrollToBottom();
      }, 100);
      
      // Additional scroll attempts to ensure it works
      setTimeout(() => {
        this.forceScrollToBottom();
      }, 300);
      
      setTimeout(() => {
        this.forceScrollToBottom();
      }, 500);
    });
  }

  private forceScrollToBottom(): void {
    // Try ViewChild first, then fallback to DOM query
    let messagesContainer = this.messagesContainer?.nativeElement;
    
    if (!messagesContainer) {
      messagesContainer = document.querySelector('.messages-container');
    }
    
    if (messagesContainer) {
      const scrollHeight = messagesContainer.scrollHeight;
      const clientHeight = messagesContainer.clientHeight;
      const scrollTop = messagesContainer.scrollTop;
      
      console.log(`📊 Admin Chat Scroll Debug - Height: ${scrollHeight}, Client: ${clientHeight}, Top: ${scrollTop}`);
      
      // Use both scrollTo and scrollTop for maximum compatibility
      messagesContainer.scrollTop = scrollHeight;
      
      // Also try with scrollTo for smooth behavior
      if (messagesContainer.scrollTo) {
        messagesContainer.scrollTo({
          top: scrollHeight,
          behavior: 'smooth'
        });
      }
      
      console.log('📜 Admin chat scrolled to bottom');
    } else {
      console.warn('⚠️ Admin chat messages container not found for scrolling');
    }
  }
}

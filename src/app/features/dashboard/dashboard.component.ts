import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSelectModule } from '@angular/material/select';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { JobSignalRService } from '../../shared/services/signalr.service';
import { ChatService } from '../../shared/services/chat.service';
import { BehaviorSubject, Observable } from 'rxjs';
import { ChatListComponent } from '../chat-list/chat-list.component';
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    MatChipsModule,
    MatSelectModule,
    MatMenuModule,
    MatDividerModule,
    ChatListComponent
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})

export class DashboardComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('chatMessages') chatMessagesContainer!: ElementRef;
  jobs: any[] = [];
    roles: any[] = [];
  skills: any[] = [];
  jobTypes: string[] = [];
  locations: string[] = [];
  appliedJobs: Map<number, any> = new Map();
  appliedJobsArray: any[] = []; 
  jobApplicants: any[] = []; 
  showApplicantsPopup: boolean = false;
  selectedJobForApplicants: any = null;

  lastUpdateTimestamp: number = Date.now();
  private statusUpdateSubject = new BehaviorSubject<number>(Date.now());
  statusUpdate$ = this.statusUpdateSubject.asObservable();

  showStatusUpdateModal: boolean = false;
  selectedApplicant: any = null;
  statusOptions = [
    { value: 'Applied', label: 'Applied', color: 'primary' },
    { value: 'Reviewed', label: 'Under Review', color: 'accent' },
    { value: 'Shortlisted', label: 'Shortlisted', color: 'warn' },
    { value: 'Rejected', label: 'Rejected', color: 'warn' },
    { value: 'Hired', label: 'Hired', color: 'primary' }
  ];
  selectedStatus: string = '';
  statusRemarks: string = '';

  showChatSidebar: boolean = false;

  showUserChatPopup: boolean = false;
  selectedJobForChat: any = null;
  userChatMessages: any[] = [];
  userNewMessage: string = '';

  isTyping: boolean = false;
  typingTimeout: any;

  userId: number = 0;
  roleId: number = 0;
  userName: string = '';
  userEmail: string = '';
  companyName: string = '';
  showAddJobPopup: boolean = false;
  newJob = {
    title: '',
    description: '',
    location: '',
    jobType: '',
    experienceRequired: 0,
    salary: 0
  };
  selectedJob: any = null;
  showApplyPopup = false;
  applyRemarks: string = '';
  selectedFile: File | null = null;
  selectedFileName: string = '';
  editJobId: number | null = null;
  isEditMode: boolean = false;
  applyForm!: FormGroup;
  searchFilters = {
    title: '',
    location: '',
    jobType: '',
    status: ''
  };
  allJobs: any[] = []; 
  filteredJobs: any[] = []; 
  searchApplied: boolean = false;

  constructor(
    private apiService: ApiService,
    private router: Router,
    private signalService: JobSignalRService,
    private chatService: ChatService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.applyForm = this.fb.group({
      remarks: [''],
      resume: [null]
    });
  }

  ngOnInit(): void {
    this.loadDropdowns();
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    const userInfo = userData.data;

    if (!userInfo?.userId) {
      this.router.navigate(['/login']);
      return;
    }

    this.userId = userInfo.userId;
    this.roleId = userInfo.roleId;
    this.userName = userInfo.fullName || 'User';
    this.userEmail = userInfo.email || '';
    this.companyName = userInfo.companyName || '';

  
    this.initializeSignalR();

    this.loadJobs();
    this.loadUserApplications(); 

 
    this.signalService.onJobChange((data) => {
    

     
      if (data.Type === 'NewApplication' || data.Type === 'NewApplicationWithResume') {
       
        if (this.roleId === 1 && data.AdminId === this.userId) {
          this.snackBar.open(`New application received for ${data.JobTitle}`, 'View', {
            duration: 5000,
            panelClass: ['success-snackbar']
          });
        }
        this.loadJobs(); 
      } else if (data.Type === 'StatusUpdated') {
        

      
        if (this.appliedJobs.has(data.JobId)) {
          const application = this.appliedJobs.get(data.JobId);
          if (application) {
            application.status = data.NewStatus || data.Status;
            application.remarks = data.Remarks || '';
            this.appliedJobs.set(data.JobId, application);
           
          }
        }

        if (this.showApplicantsPopup && this.selectedJobForApplicants?.jobId === data.JobId) {
          const applicantIndex = this.jobApplicants.findIndex(app => app.applicationId === data.ApplicationId);
          if (applicantIndex !== -1) {
            this.jobApplicants[applicantIndex].status = data.NewStatus || data.Status;
            this.jobApplicants[applicantIndex].remarks = data.Remarks || '';
          }
        }

       
        this.refreshApplicationData();

       
        if (this.roleId !== 1 && data.UserId === this.userId) {
          const statusText = data.NewStatus || data.Status;
          const jobTitle = data.JobTitle || 'your application';
          this.snackBar.open(`Your application status for ${jobTitle} has been updated to ${statusText}`, 'Close', {
            duration: 5000,
            panelClass: ['info-snackbar']
          });
        }

       
        this.cdr.detectChanges();
      } else {
     
        this.loadJobs();
      }
    });

 
    this.signalService.onStatusUpdate((data) => {
      
      this.ngZone.run(() => {
       const jobId = data.jobId || data.JobId;
        const userId = data.userId || data.UserId;
        const applicationId = data.applicationId || data.ApplicationId;
        const newStatus = data.newStatus;
        const remarks = data.remarks || data.Remarks;
        const jobTitle = data.jobTitle || data.JobTitle;


      if (this.appliedJobs.has(jobId)) {
          const application = this.appliedJobs.get(jobId);
          if (application) {
            application.status = newStatus;
            application.remarks = remarks || '';
            this.appliedJobs.set(jobId, application);
            this.syncAppliedJobsArray();

            this.cdr.markForCheck();
            this.cdr.detectChanges();
          }
        } else {

          this.loadUserApplications();
        }

        if (this.showApplicantsPopup && this.selectedJobForApplicants?.jobId === jobId) {
          const applicantIndex = this.jobApplicants.findIndex(app => app.applicationId === applicationId);
          if (applicantIndex !== -1) {
            this.jobApplicants[applicantIndex].status = newStatus;
            this.jobApplicants[applicantIndex].remarks = remarks || '';
          }
        }

        if (userId === this.userId) {
          const statusText = newStatus;
          this.snackBar.open(`Your application for ${jobTitle || 'this job'} has been ${statusText.toLowerCase()}`, 'Close', {
            duration: 5000,
            panelClass: ['info-snackbar']
          });
        }

        this.lastUpdateTimestamp = Date.now(); 
        this.cdr.markForCheck();
        this.cdr.detectChanges();

        if (!this.appliedJobs.has(jobId)) {
          setTimeout(() => {
            this.loadUserApplications();
            this.loadJobs();
          }, 500);
        }

        setTimeout(() => {
          this.cdr.detectChanges();
        }, 100);

        this.statusUpdateSubject.next(Date.now());
      }); 
    });
  }

  ngAfterViewInit(): void {
    if (this.showUserChatPopup && this.userChatMessages.length > 0) {
      setTimeout(() => {
        this.scrollChatToBottom();
      }, 100);
    }
  }

  private async initializeSignalR(): Promise<void> {
    try {
      await this.signalService.joinUserGroups(this.userId, this.roleId);

      await this.chatService.initializeChat(this.userId);

      this.subscribeToChatEvents();
    } catch (error) {
      setTimeout(() => {
        this.initializeSignalR();
      }, 2000);
    }
  }

  private subscribeToChatEvents(): void {
    this.chatService.messageReceived$.subscribe((messageData: any) => {
      if (this.showUserChatPopup && this.selectedJobForChat) {
        const adminId = this.selectedJobForChat.adminId || 1;
        
        if ((messageData.senderId === adminId && messageData.receiverId === this.userId) ||
            (messageData.senderId === this.userId && messageData.receiverId === adminId)) {

          const existingMessage = this.userChatMessages.find(msg => 
            msg.messageId === messageData.messageId || 
            (msg.senderId === messageData.senderId && 
             msg.message === messageData.message && 
             Math.abs(new Date(msg.timestamp).getTime() - new Date(messageData.timestamp).getTime()) < 5000) // Within 5 seconds
          );
          
          if (!existingMessage) {
            this.userChatMessages.push({
              messageId: messageData.messageId,
              senderId: messageData.senderId,
              receiverId: messageData.receiverId,
              message: messageData.message,
              timestamp: messageData.timestamp,
              isRead: messageData.isRead
            });

            this.userChatMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
            this.removeDuplicateMessages();
            this.cdr.detectChanges();
            setTimeout(() => {
              this.scrollChatToBottom();
            }, 150);
            
            if (messageData.senderId === adminId) {
              this.markChatMessagesAsRead(adminId);
            }
            this.cdr.detectChanges();
          }
        }
      }
      
      if (!this.showUserChatPopup || 
          !this.selectedJobForChat || 
          (this.selectedJobForChat.adminId || 1) !== messageData.senderId) {
        
        if (messageData.receiverId === this.userId) {
          this.snackBar.open(`New message received`, 'View Chat', {
            duration: 5000,
            panelClass: ['info-snackbar']
          });
        }
      }
    });

    this.chatService.messageNotification$.subscribe((notification: any) => {
      if (notification.receiverId === this.userId) {
        console.log('📩 New message notification:', notification);
      }
    });

    this.chatService.typingNotification$.subscribe((typingData: any) => {
      if (this.showUserChatPopup && this.selectedJobForChat) {
        const adminId = this.selectedJobForChat.adminId || 1;
        if (typingData.senderId === adminId && typingData.receiverId === this.userId) {
          console.log('👨‍💼 Admin is typing...');
        }
      }
    });

    this.chatService.messagesMarkedAsRead$.subscribe((readData: any) => {
      if (this.showUserChatPopup && readData.senderId === this.userId) {
        this.userChatMessages.forEach(msg => {
          if (msg.senderId === this.userId && msg.receiverId === readData.receiverId) {
            msg.isRead = true;
          }
        });
        this.cdr.detectChanges();
      }
    });
  }

  loadJobs(): void {
    const url = `job/user-jobs/${this.userId}`;
    
    this.apiService.get(url).subscribe((res: any) => {
      let allJobs = res.data;
      
      allJobs = allJobs.map((job: any) => ({
        ...job,
        adminId: job.adminId || job.createdBy || 1 
      }));
      
      this.allJobs = allJobs;

      if (this.roleId !== 1) {
        this.apiService.get(`users/get-user-register-data/${this.userId}`).subscribe((userRes: any) => {
          const selectedSkillIds = userRes.data.selectedSkillIds || [];
          const allSkills = userRes.data.allSkills || [];

          const selectedSkillNames = allSkills
            .filter((skill: any) => selectedSkillIds.includes(skill.skillId))
            .map((skill: any) => skill.skillName?.toLowerCase());

          const skillFilteredJobs = allJobs.filter((job: any) => {
            const title = job.title?.toLowerCase() || '';
            return selectedSkillNames.some((skillName: string) => title.includes(skillName));
          });

          this.jobs = skillFilteredJobs;
          this.allJobs = skillFilteredJobs;
          
          if (this.searchApplied) {
            this.applyFilters();
          }
        }, (error) => {
          console.error('Error loading user skills:', error);
          this.jobs = allJobs;
        });
      } else {
        this.jobs = allJobs;
      }
    }, (error) => {
      console.error('Error loading jobs:', error);
    });
  }

  loadUserApplications(): void {
    this.apiService.get(`job/user-applications/${this.userId}`).subscribe((res: any) => {
      if (res.success && res.data) {
        this.appliedJobs.clear();

        res.data.forEach((application: any) => {
         
          this.appliedJobs.set(application.jobId, {
            applicationId: application.applicationId,
            applicationDate: application.appliedDate,
            status: application.status || 'Applied',
            remarks: application.remarks
          });
        });

        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    }, (error) => {
      console.error('Error loading user applications:', error);
    });
  }

  refreshApplicationData(): void {

    this.loadUserApplications();


    if (this.showApplicantsPopup && this.selectedJobForApplicants) {
      this.apiService.get(`job/user-applications/0`).subscribe((res: any) => {
        if (res.success && res.data) {
          this.jobApplicants = res.data.filter((app: any) => app.jobId === this.selectedJobForApplicants.jobId);
        }
      }, (error) => {
        console.error('Error refreshing applicants data:', error);
      });
    }
  }


  submitJob(): void {
    const payload = {
      jobId: this.isEditMode && this.editJobId ? this.editJobId : 0,
      adminId: this.userId,
      ...this.newJob,
      createdDate: new Date().toISOString()
    };

    const url = this.isEditMode ? `job/update/${this.editJobId}` : 'job/add';
    const method = this.isEditMode ? this.apiService.put : this.apiService.post;

    method.call(this.apiService, url, payload).subscribe((res: any) => {
      if (res.success) {
        this.showAddJobPopup = false;
        this.resetJobForm();
      } else {
        alert(this.isEditMode ? 'Failed to update job' : 'Failed to add job');
      }
    });
  }

  openEditJob(job: any): void {
    this.isEditMode = true;
    this.editJobId = job.jobId;
    this.newJob = {
      title: job.title,
      description: job.description,
      location: job.location,
      jobType: job.jobType,
      experienceRequired: job.experienceRequired,
      salary: job.salary
    };
    this.showAddJobPopup = true;
  }
  openApplyPopup(job: any): void {
    this.selectedJob = job;
    this.applyRemarks = '';
    this.selectedFile = null;
    this.showApplyPopup = true;
  }
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.selectedFileName = input.files[0].name;
      this.selectedFile = input.files[0];
    }
  }

  submitApplication(): void {
    if (!this.selectedFile || !this.selectedJob) {
      alert("Please select a resume file.");
      return;
    }

    const formData = new FormData();
    formData.append('userId', this.userId.toString());
    formData.append('jobId', this.selectedJob.jobId.toString());
    formData.append('remarks', this.applyRemarks || '');
    formData.append('resume', this.selectedFile);

    this.apiService.post('job/apply', formData).subscribe(
      (res: any) => {
        if (!res.success) {
          alert(res.message || 'Failed to apply for the job.');
          return;
        }

        this.snackBar.open(res?.message || 'Application submitted successfully!', 'Close', {
          duration: 3000,
          verticalPosition: 'top',
          horizontalPosition: 'right',
          panelClass: ['snackbar-success']
        });

        this.loadUserApplications();

        this.showApplyPopup = false;
        this.resetApplyForm();
      },
      (err) => {
        alert(err.error || 'Failed to apply.');
      }
    );
  }
  resetApplyForm(): void {
    this.applyForm.reset();
    this.selectedFile = null;
    this.selectedFileName = '';
    this.selectedJob = null;
  }
  resetJobForm(): void {
    this.newJob = {
      title: '',
      description: '',
      location: '',
      jobType: '',
      experienceRequired: 0,
      salary: 0
    };
    this.isEditMode = false;
    this.editJobId = null;
  }

  trackByJobId(index: number, job: any): number {
    return job.jobId || index;
  }

  hasAppliedToJob(jobId: number): boolean {
    const hasApplied = this.appliedJobs.has(jobId);
    return hasApplied;
  }

  getApplicationStatus(jobId: number): string {
    const application = this.appliedJobs.get(jobId);
    if (application) {
      const applicationDate = new Date(application.applicationDate);
      const today = new Date();
      const isToday = applicationDate.toDateString() === today.toDateString();

      if (isToday) {
        return 'Applied Today';
      } else {
        const diffTime = Math.abs(today.getTime() - applicationDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          return 'Applied Yesterday';
        } else if (diffDays <= 7) {
          return `Applied ${diffDays} days ago`;
        } else {
          return `Applied ${applicationDate.toLocaleDateString()}`;
        }
      }
    }
    return '';
  }

  getApplicationStatusValue(jobId: number): string {
    if (!jobId) {
      return 'Not Applied';
    }

    const application = this.appliedJobs.get(jobId);
    const status = application ? (application.status || 'Applied') : 'Not Applied';
    return status;
  }

  getSafeApplicationStatus(jobId: number): string {
    try {
      const status = this.getApplicationStatusValue(jobId) || 'Not Applied';
      return status;
    } catch (error) {
      return 'Not Applied';
    }
  }

  getStatusForTemplate(jobId: number): string {
    const _ = this.lastUpdateTimestamp;
    return this.getSafeApplicationStatus(jobId);
  }

  getReactiveStatus(jobId: number): string {
    this.statusUpdate$.subscribe(() => {
    });
    return this.getSafeApplicationStatus(jobId);
  }

  private syncAppliedJobsArray(): void {
    this.appliedJobsArray = Array.from(this.appliedJobs.values());
  }

  getApplicationStatusFromArray(jobId: number): string {
    const application = this.appliedJobsArray.find(app => app.jobId === jobId);
    const status = application ? (application.status || 'Applied') : 'Not Applied';
    return status;
  }

  getStatusIcon(status: string): string {
    if (!status) {
      return 'help';
    }

    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'applied': return 'send';
      case 'reviewed': return 'visibility';
      case 'shortlisted': return 'star';
      case 'rejected': return 'close';
      case 'hired': return 'check_circle';
      default: return 'help';
    }
  }

  showJobApplicants(job: any): void {
    this.selectedJobForApplicants = job;

    this.apiService.get(`job/user-applications/0`).subscribe((res: any) => {
      if (res.success && res.data) {
        this.jobApplicants = res.data.filter((app: any) => app.jobId === job.jobId);
        this.showApplicantsPopup = true;
      }
    }, (error) => {
      alert('Error loading applicants');
    });
  }

  downloadResume(applicant: any): void {
    if (applicant.applicationId) {
      const downloadUrl = `${this.apiService['baseUrl']}/job/download-resume/${applicant.applicationId}`;

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${applicant.userName}_resume`;
      link.target = '_blank';

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } else {
      alert('Error: Unable to download resume - Application ID missing');
    }
  }

  getApplicantsByStatus(status: string): any[] {
    return this.jobApplicants.filter(applicant => applicant.status === status);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) return 'Yesterday';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 30) return `${Math.ceil(diffDays / 7)} weeks ago`;

    return date.toLocaleDateString();
  }

  openStatusUpdateModal(applicant: any): void {
    this.selectedApplicant = applicant;
    this.selectedStatus = applicant.status;
    this.statusRemarks = applicant.remarks || '';
    this.showStatusUpdateModal = true;
  }

  closeStatusUpdateModal(): void {
    this.showStatusUpdateModal = false;
    this.selectedApplicant = null;
    this.selectedStatus = '';
    this.statusRemarks = '';
  }

  updateApplicationStatus(): void {
    if (!this.selectedApplicant || !this.selectedStatus) {
      this.snackBar.open('Please select a status', 'Close', { duration: 3000 });
      return;
    }

    const updateRequest = {
      applicationId: this.selectedApplicant.applicationId,
      jobId: this.selectedApplicant.jobId,
      userId: this.selectedApplicant.userId,
      status: this.selectedStatus,
      remarks: this.statusRemarks
    };

    this.apiService.put('job/update-application-status', updateRequest).subscribe(
      (response: any) => {
        if (response.success) {
          const applicantIndex = this.jobApplicants.findIndex(
            app => app.applicationId === this.selectedApplicant.applicationId
          );

          if (applicantIndex !== -1) {
            this.jobApplicants[applicantIndex].status = this.selectedStatus;
            this.jobApplicants[applicantIndex].remarks = this.statusRemarks;
          }

          this.snackBar.open('Application status updated successfully', 'Close', {
            duration: 3000,
            panelClass: ['success-snackbar']
          });

          this.closeStatusUpdateModal();
        } else {
          this.snackBar.open('Failed to update status: ' + response.message, 'Close', {
            duration: 5000,
            panelClass: ['error-snackbar']
          });
        }
      },
      (error) => {
        this.snackBar.open('Error updating application status', 'Close', {
          duration: 5000,
          panelClass: ['error-snackbar']
        });
      }
    );
  }

  getStatusColorClass(status: string): string {
    if (!status) {
      return 'status-default';
    }

    const statusLower = status.toLowerCase();
    switch (statusLower) {
      case 'applied': return 'status-applied';
      case 'reviewed': return 'status-reviewed';
      case 'shortlisted': return 'status-shortlisted';
      case 'rejected': return 'status-rejected';
      case 'hired': return 'status-hired';
      default: return 'status-default';
    }
  }

  toggleChatSidebar(): void {
    this.showChatSidebar = !this.showChatSidebar;
  }

  openJobChat(): void {
    this.showChatSidebar = true;
    
    // Scroll to bottom when opening job chat
    setTimeout(() => {
      this.scrollChatToBottom();
    }, 300);
  }

  closeChatSidebar(): void {
    this.showChatSidebar = false;
  }

  openUserChat(job: any): void {
    this.selectedJobForChat = job;
    this.showUserChatPopup = true;
    
    // Get the admin ID for this job (fallback to 1 if not specified)
    const adminId = job.adminId || 1;
    
    // Join the chat room for real-time messaging
    this.chatService.joinChatRoom(this.userId, adminId).then(() => {
      console.log(`✅ Joined chat room with admin ${adminId}`);
    }).catch(error => {
      console.error('❌ Failed to join chat room:', error);
    });
    
    this.loadUserChatMessages(adminId);
    
    // Scroll to bottom when chat opens
    setTimeout(() => {
      this.scrollChatToBottom();
    }, 500);
  }

  closeUserChatPopup(): void {
    // Leave the chat room when closing
    if (this.selectedJobForChat) {
      const adminId = this.selectedJobForChat.adminId || 1;
      this.chatService.leaveChatRoom(this.userId, adminId).then(() => {
        console.log(`✅ Left chat room with admin ${adminId}`);
      }).catch(error => {
        console.error('❌ Failed to leave chat room:', error);
      });
    }
    
    this.showUserChatPopup = false;
    this.selectedJobForChat = null;
    this.userChatMessages = [];
    this.userNewMessage = '';
  }

  loadUserChatMessages(adminId: number): void {
    // Show loading state
    this.userChatMessages = [];
    
    // Load real conversation from API
    this.chatService.getConversation(this.userId, adminId).subscribe(
      (response: any) => {
        console.log('📥 API Response:', response);
        
        if (response && response.success && response.data && Array.isArray(response.data)) {
          console.log(`📨 Found ${response.data.length} messages`);
          this.userChatMessages = response.data.map((msg: any) => ({
            messageId: msg.messageId,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            message: msg.messageText,
            timestamp: new Date(msg.sentAt),
            isRead: msg.isRead || false
          }));
          
          // Sort messages by timestamp and remove duplicates
          this.userChatMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
          this.removeDuplicateMessages();
          
          console.log('💬 Processed messages:', this.userChatMessages);
        } else if (response && Array.isArray(response)) {
          // Handle case where response is directly an array
          console.log(`📨 Direct array response with ${response.length} messages`);
          this.userChatMessages = response.map((msg: any) => ({
            messageId: msg.messageId,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            message: msg.messageText,
            timestamp: new Date(msg.sentAt),
            isRead: msg.isRead || false
          }));
          
          this.userChatMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        } else {
          // No existing conversation, create initial demo messages
          console.log('📝 No existing conversation, creating demo messages');
          this.createDemoMessages(adminId);
        }
        
        // Mark messages as read
        if (this.userChatMessages.length > 0) {
          this.markChatMessagesAsRead(adminId);
        }
        
        // Trigger change detection first
        this.cdr.detectChanges();
        
        // Scroll to bottom after loading with multiple attempts
        setTimeout(() => {
          this.scrollChatToBottom();
        }, 200);
        
        setTimeout(() => {
          this.scrollChatToBottom();
        }, 500);
      },
      (error) => {
        console.error('❌ Error loading chat messages:', error);
        
        // Don't show error for 404 (no existing conversation) - create demo messages instead
        if (error.status === 404 || error.status === 0) {
          console.log('📝 Creating demo messages due to 404/connection error');
          this.createDemoMessages(adminId);
        } else {
          this.snackBar.open('Failed to load chat messages', 'Close', {
            duration: 3000,
            panelClass: ['error-snackbar']
          });
        }
      }
    );
  }

  private createDemoMessages(adminId: number): void {
    // Create some demo messages for testing
    this.userChatMessages = [
      {
        messageId: 1,
        senderId: this.userId,
        receiverId: adminId,
        message: `Hello! I'm interested in the ${this.selectedJobForChat?.title} position. Could you provide more details about the role?`,
        timestamp: new Date(Date.now() - 86400000), // 1 day ago
        isRead: true
      },
      {
        messageId: 2,
        senderId: adminId,
        receiverId: this.userId,
        message: `Thank you for your interest! We have received your application and will review it shortly. Feel free to ask any questions about the position.`,
        timestamp: new Date(Date.now() - 82800000), // 23 hours ago
        isRead: true
      }
    ];
    
    // Check if user has applied to this job and add status-related message
    const application = this.appliedJobs.get(this.selectedJobForChat?.jobId);
    if (application && application.status !== 'Applied') {
      this.userChatMessages.push({
        messageId: 3,
        senderId: adminId,
        receiverId: this.userId,
        message: this.getStatusMessage(application.status, application.remarks),
        timestamp: new Date(Date.now() - 7200000), // 2 hours ago
        isRead: true
      });
    }
    
    console.log('📝 Created demo messages:', this.userChatMessages);
    
    // Trigger change detection
    this.cdr.detectChanges();
  }

  private getStatusMessage(status: string, remarks?: string): string {
    let baseMessage = '';
    switch (status) {
      case 'Reviewed':
        baseMessage = 'We have reviewed your application and it looks promising!';
        break;
      case 'Shortlisted':
        baseMessage = 'Congratulations! You have been shortlisted for this position. We will contact you soon for the next steps.';
        break;
      case 'Rejected':
        baseMessage = 'Thank you for your application. Unfortunately, we have decided to move forward with other candidates.';
        break;
      case 'Hired':
        baseMessage = 'Congratulations! We are pleased to offer you this position. Welcome to the team!';
        break;
      default:
        baseMessage = 'We will update you on your application status soon.';
    }

    if (remarks) {
      baseMessage += ` Additional feedback: ${remarks}`;
    }

    return baseMessage;
  }

  // Debug method - remove in production
  addTestMessage(): void {
    if (!this.selectedJobForChat) return;
    
    const adminId = this.selectedJobForChat.adminId || 1;
    
    const testMessage = {
      messageId: Date.now(),
      senderId: this.userId,
      receiverId: adminId,
      message: 'This is a test message to verify the UI is working correctly.',
      timestamp: new Date(),
      isRead: false
    };
    
    this.userChatMessages.push(testMessage);
    console.log('🧪 Added test message:', testMessage);
    console.log('💬 Current messages array:', this.userChatMessages);
    
    this.cdr.detectChanges();
    
    setTimeout(() => {
      this.scrollChatToBottom();
    }, 100);
  }

  trackByMessageId(index: number, message: any): any {
    return message.messageId;
  }

  logout(): void {
    // Show confirmation before logging out
    const confirmLogout = confirm('Are you sure you want to logout?');
    
    if (confirmLogout) {
      try {
        // Disconnect from SignalR and chat services
        this.signalService.offJobChange();
        this.signalService.offStatusUpdate();
        
        // Update user status to offline
        if (this.userId) {
          this.chatService.updateOnlineStatus(this.userId, false).catch(error => {
            console.error('Failed to update offline status:', error);
          });
        }
        
        // Leave any active chat rooms
        if (this.selectedJobForChat) {
          const adminId = this.selectedJobForChat.adminId || 1;
          this.chatService.leaveChatRoom(this.userId, adminId).catch(error => {
            console.error('Failed to leave chat room:', error);
          });
        }
        
        // Disconnect chat service
        this.chatService.disconnect();
        
        // Clear typing timeout
        if (this.typingTimeout) {
          clearTimeout(this.typingTimeout);
        }
        
        // Clear local storage
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        
        // Clear session storage if used
        sessionStorage.clear();
        
        // Show logout success message
        this.snackBar.open('Logged out successfully', 'Close', {
          duration: 2000,
          panelClass: ['success-snackbar']
        });
        
        // Navigate to login page
        this.router.navigate(['/login']);
        
      } catch (error) {
        console.error('Error during logout:', error);
        
        // Even if there's an error, still clear storage and navigate
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        sessionStorage.clear();
        
        this.router.navigate(['/login']);
      }
    }
  }

  getUserInitials(): string {
    if (!this.userName) return 'U';
    
    const names = this.userName.split(' ');
    if (names.length >= 2) {
      return (names[0][0] + names[1][0]).toUpperCase();
    }
    return this.userName[0].toUpperCase();
  }

  private removeDuplicateMessages(): void {
    const uniqueMessages = [];
    const seenMessages = new Set();
    
    for (const message of this.userChatMessages) {
      // Create a unique key based on sender, message content, and approximate timestamp
      const messageKey = `${message.senderId}-${message.message}-${Math.floor(new Date(message.timestamp).getTime() / 60000)}`; // Group by minute
      
      if (!seenMessages.has(messageKey)) {
        seenMessages.add(messageKey);
        uniqueMessages.push(message);
      }
    }
    
    this.userChatMessages = uniqueMessages;
  }

  private markChatMessagesAsRead(adminId: number): void {
    const unreadMessages = this.userChatMessages.filter(msg => 
      msg.senderId === adminId && !msg.isRead
    );
    
    if (unreadMessages.length > 0) {
      this.chatService.markMessagesAsRead({
        senderId: adminId,
        receiverId: this.userId
      }).subscribe(
        (response) => {
          if (response.success) {
            // Update local messages as read
            this.userChatMessages.forEach(msg => {
              if (msg.senderId === adminId) {
                msg.isRead = true;
              }
            });
          }
        },
        (error) => {
          console.error('Error marking messages as read:', error);
        }
      );
    }
  }

  private scrollChatToBottom(): void {
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
    let chatContainer = this.chatMessagesContainer?.nativeElement;
    
    if (!chatContainer) {
      chatContainer = document.querySelector('.chat-messages');
    }
    
    if (chatContainer) {
      const scrollHeight = chatContainer.scrollHeight;
      const clientHeight = chatContainer.clientHeight;
      const scrollTop = chatContainer.scrollTop;
      
      console.log(`📊 Scroll Debug - Height: ${scrollHeight}, Client: ${clientHeight}, Top: ${scrollTop}`);
      
      // Use both scrollTo and scrollTop for maximum compatibility
      chatContainer.scrollTop = scrollHeight;
      
      // Also try with scrollTo for smooth behavior
      if (chatContainer.scrollTo) {
        chatContainer.scrollTo({
          top: scrollHeight,
          behavior: 'smooth'
        });
      }
      
      console.log('📜 Chat scrolled to bottom');
    } else {
      console.warn('⚠️ Chat container not found for scrolling');
    }
  }

  onUserTyping(): void {
    if (!this.selectedJobForChat) return;
    
    const adminId = this.selectedJobForChat.adminId || 1;
    
    // Send typing notification if not already typing
    if (!this.isTyping) {
      this.isTyping = true;
      this.chatService.sendTypingNotification(this.userId, adminId, true).catch(error => {
        console.error('Failed to send typing notification:', error);
      });
    }
    
    // Clear previous timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Set timeout to stop typing after 2 seconds of inactivity
    this.typingTimeout = setTimeout(() => {
      this.isTyping = false;
      this.chatService.sendTypingNotification(this.userId, adminId, false).catch(error => {
        console.error('Failed to send stop typing notification:', error);
      });
    }, 2000);
  }

  sendUserMessage(): void {
    if (!this.userNewMessage.trim() || !this.selectedJobForChat) return;

    const adminId = this.selectedJobForChat.adminId || 1;
    const messageText = this.userNewMessage.trim();
    
    console.log(`📤 Sending message from user ${this.userId} to admin ${adminId}: "${messageText}"`);
    
    // Create temporary message for immediate UI feedback
    const tempMessage = {
      messageId: Date.now(), // Temporary ID
      senderId: this.userId,
      receiverId: adminId,
      message: messageText,
      timestamp: new Date(),
      isRead: false
    };
    
    // Add message to UI immediately for better UX
    this.userChatMessages.push(tempMessage);
    this.cdr.detectChanges();
    
    // Clear input immediately
    this.userNewMessage = '';
    
    // Scroll to bottom
    setTimeout(() => {
      this.scrollChatToBottom();
    }, 100);
    
    // Stop typing indicator
    if (this.isTyping) {
      this.isTyping = false;
      this.chatService.sendTypingNotification(this.userId, adminId, false).catch(error => {
        console.error('Failed to send stop typing notification:', error);
      });
    }

    // Send message via API
    this.chatService.sendMessage({
      senderId: this.userId,
      receiverId: adminId,
      messageText: messageText,
      sentAt: new Date()
    }).subscribe(
      (response: any) => {
        console.log('✅ Message sent successfully:', response);
        
        if (response.success && response.data) {
          // Update the temporary message with real data from server
          const messageIndex = this.userChatMessages.findIndex(msg => msg.messageId === tempMessage.messageId);
          if (messageIndex !== -1) {
            this.userChatMessages[messageIndex] = {
              messageId: response.data.messageId,
              senderId: response.data.senderId,
              receiverId: response.data.receiverId,
              message: response.data.messageText,
              timestamp: new Date(response.data.sentAt),
              isRead: response.data.isRead || false
            };
            
            console.log('🔄 Updated message with real data:', this.userChatMessages[messageIndex]);
            this.cdr.detectChanges();
          }
        } else {
          console.log('⚠️ Unexpected API response format:', response);
        }
      },
      (error) => {
        console.error('❌ Error sending message:', error);
        
        // Remove the failed message from UI
        const messageIndex = this.userChatMessages.findIndex(msg => msg.messageId === tempMessage.messageId);
        if (messageIndex !== -1) {
          this.userChatMessages.splice(messageIndex, 1);
          this.cdr.detectChanges();
        }
        
        this.snackBar.open('Failed to send message. Please try again.', 'Close', {
          duration: 3000,
          panelClass: ['error-snackbar']
        });
        
        // Restore the message text in input if sending failed
        this.userNewMessage = messageText;
      }
    );
  }

  formatChatTime(date: Date): string {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  onSearchChange(): void {
    if (this.searchFilters.title || this.searchFilters.location) {
      this.applyFilters();
    }
  }

  applyFilters(): void {
    this.searchApplied = true;
    let filtered = [...this.allJobs];

    if (this.searchFilters.title.trim()) {
      const searchTerm = this.searchFilters.title.toLowerCase();
      filtered = filtered.filter(job => 
        job.title?.toLowerCase().includes(searchTerm) ||
        job.description?.toLowerCase().includes(searchTerm)
      );
    }

    if (this.searchFilters.location.trim()) {
      const searchLocation = this.searchFilters.location.toLowerCase();
      filtered = filtered.filter(job => 
        job.location?.toLowerCase().includes(searchLocation)
      );
    }

    if (this.searchFilters.jobType) {
      filtered = filtered.filter(job => 
        job.jobType?.toLowerCase() === this.searchFilters.jobType.toLowerCase()
      );
    }

    if (this.searchFilters.status) {
      if (this.searchFilters.status === 'not-applied') {
        filtered = filtered.filter(job => !this.hasAppliedToJob(job.jobId));
      } else {
        filtered = filtered.filter(job => {
          const application = this.appliedJobs.get(job.jobId);
          return application && application.status === this.searchFilters.status;
        });
      }
    }

    this.filteredJobs = filtered;
    this.jobs = filtered;
  }

  clearFilters(): void {
    this.searchFilters = {
      title: '',
      location: '',
      jobType: '',
      status: ''
    };
    this.searchApplied = false;
    this.jobs = [...this.allJobs];
    this.filteredJobs = [];
  }

  hasActiveFilters(): boolean {
    return !!(this.searchFilters.title || this.searchFilters.location || 
              this.searchFilters.jobType || this.searchFilters.status);
  }

  removeFilter(filterType: string): void {
    switch (filterType) {
      case 'title':
        this.searchFilters.title = '';
        break;
      case 'location':
        this.searchFilters.location = '';
        break;
      case 'jobType':
        this.searchFilters.jobType = '';
        break;
      case 'status':
        this.searchFilters.status = '';
        break;
    }
    
    if (this.hasActiveFilters()) {
      this.applyFilters();
    } else {
      this.clearFilters();
    }
  }

  ngOnDestroy(): void {
    // Clean up SignalR subscriptions
    this.signalService.offJobChange();
    this.signalService.offStatusUpdate();
    
    // Leave any active chat rooms
    if (this.selectedJobForChat) {
      const adminId = this.selectedJobForChat.adminId || 1;
      this.chatService.leaveChatRoom(this.userId, adminId).catch(error => {
        console.error('❌ Failed to leave chat room on destroy:', error);
      });
    }
    
    // Clear typing timeout
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    
    // Disconnect chat service
    this.chatService.disconnect();
  }

  loadDropdowns() {
    this.apiService.get('users/dropdown-data').subscribe((res: any) => {
      this.roles = res.data.roles;
      this.skills = res.data.skills;
      this.jobTypes = res.data.jobTypes;
      this.locations = res.data.locations;
    });
  }
}

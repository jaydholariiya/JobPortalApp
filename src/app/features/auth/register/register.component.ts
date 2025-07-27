import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { ApiService } from '../../../core/services/api.service';
import { JobSignalRService } from '../../../shared/services/signalr.service';

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, FormsModule, CommonModule, MatInputModule, MatSelectModule, MatFormFieldModule, MatButtonModule, MatCardModule, MatIconModule, MatSnackBarModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss'
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  roles: any[] = [];
  skills: any[] = [];
  jobTypes: string[] = [];
  locations: string[] = [];

  constructor(
    private fb: FormBuilder,
    private apiService: ApiService,
    private router: Router,
    private snackBar: MatSnackBar,
    private signalService: JobSignalRService
  ) { }

  ngOnInit(): void {
    this.initForm();
    this.loadDropdowns();
  }

  initForm() {
    this.registerForm = this.fb.group({
      fullName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      roleId: ['', Validators.required],
      companyName: [''],
      skillIds: [[]],
      preferredLocation: [''],
      jobType: [''],
      jobs: this.fb.array([])
    });
  }

  loadDropdowns() {
    this.apiService.get('users/dropdown-data').subscribe((res: any) => {
      this.roles = res.data.roles;
      this.skills = res.data.skills;
      this.jobTypes = res.data.jobTypes;
      this.locations = res.data.locations;
    });
  }

  get jobs(): FormArray {
    return this.registerForm.get('jobs') as FormArray;
  }

  addJob() {
    this.jobs.push(this.fb.group({
      title: ['', Validators.required],
      description: ['', Validators.required],
      location: ['', Validators.required],
      jobType: ['', Validators.required],
      experienceRequired: [0, [Validators.required, Validators.min(0)]],
      salary: [0, [Validators.required, Validators.min(0)]],
    }));
  }

  removeJob(index: number) {
    this.jobs.removeAt(index);
    this.jobs.markAsDirty();
    this.jobs.updateValueAndValidity();
    this.onSubmit();

  }

  onRoleChange() {
    const roleId = +this.registerForm.get('roleId')?.value;
    if (roleId === 1) {
      // Admin role - require company name, clear job seeker fields
      this.registerForm.get('companyName')?.setValidators([Validators.required]);
      this.registerForm.get('skillIds')?.setValue([]);
      this.registerForm.get('preferredLocation')?.reset();
      this.registerForm.get('jobType')?.reset();
      if (this.jobs.length === 0) this.addJob();
    } else {
      // Job seeker role - clear admin fields
      this.registerForm.get('companyName')?.clearValidators();
      this.registerForm.get('companyName')?.reset();
      this.jobs.clear();
    }
    this.registerForm.get('companyName')?.updateValueAndValidity();
  }

  onSubmit() {
    if (this.registerForm.invalid) return;

    const payload = { ...this.registerForm.value };

    const roleId = +payload.roleId;

    if (roleId === 1) {
      // Admin role - remove job seeker fields
      delete payload.skillIds;
      delete payload.preferredLocation;
      delete payload.jobType;
    } else if (roleId === 2) {
      // Job seeker role - remove admin fields
      delete payload.jobs;
      delete payload.companyName;
    }

    this.apiService.post('users/register', payload).subscribe((res: any) => {

      const userData = {
        userId: res.data.user.userId,
        userName: res.data.user.userName,
        roleId: res.data.user.roleId
      };
      localStorage.setItem('user', JSON.stringify({ success: true, data: userData }));
      
     
      try {
        this.signalService.joinUserGroups(userData.userId, userData.roleId);
      } catch (error) {
        
      }
      
      this.snackBar.open('Registration successful!', 'Close', {
        duration: 3000, 
        verticalPosition: 'top',
        horizontalPosition: 'right', 
        panelClass: ['snackbar-success'] 
      });
      this.router.navigate(['dashboard']);
    });
  }
}

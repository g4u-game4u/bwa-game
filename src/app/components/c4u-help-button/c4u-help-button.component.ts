import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { HelpService } from '@services/help.service';

@Component({
  selector: 'c4u-help-button',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './c4u-help-button.component.html',
  styleUrls: ['./c4u-help-button.component.scss']
})
export class HelpButtonComponent implements OnInit, OnDestroy {
  @ViewChild('nomeInput') nomeInput!: ElementRef<HTMLInputElement>;

  isOpen = false;
  isSubmitting = false;
  submitSuccess = false;
  submitError = false;

  helpForm!: FormGroup;

  private submitSubscription?: Subscription;

  constructor(private helpService: HelpService) {}

  ngOnInit(): void {
    this.helpForm = new FormGroup({
      nome: new FormControl('', [Validators.required, Validators.minLength(2)]),
      email: new FormControl('', [Validators.required, Validators.email]),
      descricao: new FormControl('', [Validators.required, Validators.minLength(10)])
    });
  }

  ngOnDestroy(): void {
    this.submitSubscription?.unsubscribe();
  }

  toggle(): void {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      this.focusNomeField();
    }
  }

  close(): void {
    this.isOpen = false;
    this.submitSuccess = false;
    this.submitError = false;
  }

  onOverlayClick(event: MouseEvent): void {
    this.close();
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.close();
    }
  }

  onSubmit(): void {
    if (this.helpForm.invalid || this.isSubmitting) return;

    this.isSubmitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    const payload = this.helpService.buildPayload(this.helpForm.value);

    this.submitSubscription = this.helpService.submitReport(payload).subscribe({
      next: () => {
        this.isSubmitting = false;
        this.submitSuccess = true;
        this.helpForm.reset();
      },
      error: () => {
        this.isSubmitting = false;
        this.submitError = true;
      }
    });
  }

  private focusNomeField(): void {
    setTimeout(() => {
      if (this.nomeInput) {
        this.nomeInput.nativeElement.focus();
      } else {
        const el = document.getElementById('help-nome');
        if (el) {
          el.focus();
        }
      }
    });
  }
}

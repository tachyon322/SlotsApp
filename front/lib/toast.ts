import { toast } from 'sonner';

export function showError(message: string | null | undefined): void {
  if (!message) return;
  toast.error(message);
}

export function showSuccess(message: string | null | undefined): void {
  if (!message) return;
  toast.success(message);
}

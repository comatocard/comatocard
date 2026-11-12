"use client";
import { BottomSheet, Button } from "../ui";

/** Log out is confirmed: it disconnects the wallet and goes back to the start. */
export function LogoutSheet({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} label="Log out">
      <h2 className="mb-1 text-xl font-semibold">Log out?</h2>
      <p className="mb-5 text-sm text-muted">
        Your vault, its cards and its funds stay on chain. Connect the same wallet any time.
      </p>
      <Button onClick={onConfirm}>Yes, log out</Button>
      <button
        type="button"
        onClick={onClose}
        className="mt-3 h-12 w-full text-[15px] font-semibold text-muted"
      >
        Cancel
      </button>
    </BottomSheet>
  );
}

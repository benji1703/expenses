import type { ActionState } from "@/app/actions";

export function FormStatus({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p className="message error" role="alert">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="message success" role="status">
          {state.success}
        </p>
      )}
    </>
  );
}

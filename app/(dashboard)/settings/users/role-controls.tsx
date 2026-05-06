"use client";

import { useTransition } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { setUserRole, setUserActive } from "./actions";

export function UserRoleControls({
  userId,
  role,
  isActive,
}: {
  userId: string;
  role: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <Select
        defaultValue={role}
        onValueChange={(value) =>
          startTransition(async () => {
            try {
              await setUserRole(userId, value);
              toast.success("Role updated");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed");
            }
          })
        }
        disabled={pending}
      >
        <SelectTrigger className="h-7 w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="rep">rep</SelectItem>
          <SelectItem value="manager">manager</SelectItem>
          <SelectItem value="admin">admin</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await setUserActive(userId, !isActive);
              toast.success(isActive ? "Deactivated" : "Activated");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed");
            }
          })
        }
      >
        {isActive ? "Deactivate" : "Activate"}
      </Button>
    </div>
  );
}

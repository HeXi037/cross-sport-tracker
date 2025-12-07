import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { consumeLoginRedirect } from "../../../lib/loginRedirect";
import { getLoginErrorMessage, loginUser } from "../services/authService";

interface UseLoginFormOptions {
  onSuccess?: () => void;
}

export function useLoginForm({ onSuccess }: UseLoginFormOptions = {}) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  const handleLogin = async (event: FormEvent) => {
    event.preventDefault();
    setErrors([]);
    try {
      const result = await loginUser(username, password);
      onSuccess?.();
      if (result.mustChangePassword) {
        router.push("/set-password");
        return;
      }
      const redirectTarget = consumeLoginRedirect();
      router.push(redirectTarget ?? "/");
    } catch (err) {
      setErrors([getLoginErrorMessage(err)]);
    }
  };

  return {
    username,
    setUsername,
    password,
    setPassword,
    errors,
    handleLogin,
  };
}

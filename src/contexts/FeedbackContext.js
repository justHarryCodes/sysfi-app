"use client";
// contexts/FeedbackContext.js — web stand-in for the app's LoadingContext
// (full-screen step overlay) and AlertContext / utils/Alert (button dialogs).
import { createContext, useCallback, useContext, useRef, useState } from "react";
import LoadingOverlay from "@/components/feedback/LoadingOverlay";
import AlertDialog from "@/components/feedback/AlertDialog";

const FeedbackContext = createContext(null);

export function FeedbackProvider({ children }) {
  const [loading, setLoading] = useState(null); // { message, step, totalSteps }
  const [alert, setAlert] = useState(null); // { title, message, buttons }
  const queue = useRef([]);

  const showLoading = useCallback((message, { step, totalSteps } = {}) => {
    setLoading({ message, step, totalSteps });
  }, []);

  const updateLoading = useCallback((message, step) => {
    setLoading((prev) => ({ ...(prev || {}), message, step: step ?? prev?.step }));
  }, []);

  const hideLoading = useCallback(() => setLoading(null), []);

  /** Same call shape as React Native's Alert.alert(title, message, buttons). */
  const showAlert = useCallback((title, message, buttons) => {
    const next = { title, message, buttons: buttons?.length ? buttons : [{ text: "OK" }] };
    setAlert((current) => {
      if (current) {
        queue.current.push(next);
        return current;
      }
      return next;
    });
  }, []);

  const closeAlert = useCallback(() => {
    setAlert(queue.current.shift() || null);
  }, []);

  return (
    <FeedbackContext.Provider value={{ showLoading, updateLoading, hideLoading, showAlert }}>
      {children}
      {loading && <LoadingOverlay {...loading} />}
      {alert && <AlertDialog {...alert} onClose={closeAlert} />}
    </FeedbackContext.Provider>
  );
}

export const useFeedback = () => {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used within FeedbackProvider");
  return ctx;
};

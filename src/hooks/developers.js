"use client";
// hooks/developers.js — developer portal data.
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import * as D from "@/lib/developers";
import * as M from "@/lib/miniapp/api";

export const devKeys = {
  me: (uid) => ["user", uid, "dev", "me"],
  apps: (uid) => ["user", uid, "dev", "apps"],
  app: (uid, id) => ["user", uid, "dev", "app", id],
  keys: (uid) => ["user", uid, "dev", "keys"],
  applications: (uid, status) => ["user", uid, "dev", "admin", "applications", status],
  pending: (uid) => ["user", uid, "dev", "admin", "pending"],
};

const retry = (n, err) => !D.isNotDeployed(err) && err?.status !== 403 && n < 2;

function useUid() {
  return useAuth().user?.uid;
}

export const useDeveloperMe = () => {
  const uid = useUid();
  return useQuery({ queryKey: devKeys.me(uid), queryFn: D.getDeveloperMe, enabled: !!uid, staleTime: 60_000, retry });
};
export const useMyApps = (enabled = true) => {
  const uid = useUid();
  return useQuery({ queryKey: devKeys.apps(uid), queryFn: D.getMyApps, enabled: !!uid && enabled, staleTime: 30_000, retry });
};
export const useDevApp = (id) => {
  const uid = useUid();
  return useQuery({ queryKey: devKeys.app(uid, id), queryFn: () => M.getMiniAppAuthed(id), enabled: !!uid && !!id && id !== "new", retry });
};
export const useApiKeys = (enabled = true) => {
  const uid = useUid();
  return useQuery({ queryKey: devKeys.keys(uid), queryFn: D.listKeys, enabled: !!uid && enabled, staleTime: 30_000, retry });
};
export const useApplications = (status, enabled = true) => {
  const uid = useUid();
  return useQuery({ queryKey: devKeys.applications(uid, status), queryFn: () => D.getApplications(status), enabled: !!uid && enabled, retry });
};
export const usePendingApps = (enabled = true) => {
  const uid = useUid();
  return useQuery({ queryKey: devKeys.pending(uid), queryFn: M.getPendingApps, enabled: !!uid && enabled, retry });
};

"use client";
// Global "create post" sheet — the dock's Create button, the feed composer
// and a tribe's Posts tab all open it (port of CreatePostModal, plus a
// tribe picker when opened outside a tribe).
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IoImageOutline, IoClose, IoChevronDown } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Avatar from "@/components/ui/Avatar";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useCreatePost, useMyTribes } from "@/hooks/tribes";
import { uploadImage, validateImageFile } from "@/lib/upload";

const MAX = 500;
const ComposeContext = createContext(null);

function ComposeSheet({ initialTribe, onClose }) {
  const router = useRouter();
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const mine = useMyTribes();
  const create = useCreatePost();
  const [tribe, setTribe] = useState(initialTribe || null);
  const [picking, setPicking] = useState(!initialTribe);
  const [text, setText] = useState("");
  const [image, setImage] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => () => image?.url && URL.revokeObjectURL(image.url), [image]);

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const bad = validateImageFile(f);
    if (bad) return showAlert("Error", bad);
    setImage({ file: f, url: URL.createObjectURL(f) });
  };

  const submit = async () => {
    if (!tribe || !text.trim()) return;
    try {
      let imageUrl = null;
      if (image) {
        setUploading(true);
        imageUrl = (await uploadImage(image.file, `posts/${tribe.id}`)).url;
        setUploading(false);
      }
      const post = await create.mutateAsync({ tribeId: tribe.id, description: text.trim(), imageUrl });
      onClose();
      if (!initialTribe && post?.id) router.push(`/post/${tribe.id}/${post.id}`);
    } catch (e) {
      setUploading(false);
      showAlert("Couldn't post", e.message || "Please try again.");
    }
  };

  const busy = uploading || create.isPending;

  return (
    <Modal open onClose={() => !busy && onClose()} labelledBy="compose-title" dismissible={!busy}>
      <div className="mb-4 flex items-center justify-between">
        <h2 id="compose-title" className="text-lg font-bold text-text">
          New post
        </h2>
        <button type="button" onClick={onClose} disabled={busy} aria-label="Close" className="rounded-full p-1.5 text-text-secondary hover:bg-hover">
          <IoClose size={20} />
        </button>
      </div>

      {picking ? (
        <div>
          <p className="mb-2 text-sm text-text-secondary">Post to which tribe?</p>
          <ul className="max-h-[50dvh] overflow-y-auto">
            {(mine.data || []).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTribe(t);
                    setPicking(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-hover"
                >
                  <TribeAvatar tribe={t} size={36} />
                  <span className="truncate font-semibold text-text">{t.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {mine.data?.length === 0 && <p className="py-6 text-center text-sm text-text-secondary">Join a tribe first to post in it.</p>}
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={() => !initialTribe && setPicking(true)}
            disabled={!!initialTribe}
            className="mb-3 flex items-center gap-2 rounded-full bg-hover py-1 pl-1 pr-3 text-sm font-semibold text-text"
          >
            <TribeAvatar tribe={tribe} size={24} />
            {tribe.name}
            {!initialTribe && <IoChevronDown size={14} className="text-text-tertiary" />}
          </button>
          <div className="flex gap-3">
            <Avatar src={user?.profileImageUrl} size={40} />
            <textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              rows={5}
              placeholder="What's happening in the tribe?"
              aria-label="Post text"
              className="min-h-[120px] flex-1 resize-none bg-transparent text-[17px] leading-6 text-text outline-none placeholder:text-text-tertiary"
            />
          </div>
          {image && (
            <div className="relative mb-3 mt-2 overflow-hidden rounded-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.url} alt="" className="max-h-72 w-full object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Remove image"
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white"
              >
                <IoClose size={16} />
              </button>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between border-t border-divider pt-3">
            <label className="cursor-pointer rounded-full p-2 text-primary hover:bg-primary/10" aria-label="Add image">
              <input type="file" accept="image/*" className="sr-only" onChange={pick} />
              <IoImageOutline size={22} />
            </label>
            <div className="flex items-center gap-3">
              <span className={`text-xs tabular-nums ${text.length > MAX - 40 ? "text-warning" : "text-text-tertiary"}`}>
                {text.length}/{MAX}
              </span>
              <Button title={uploading ? "Uploading…" : "Post"} size="small" className="rounded-full" disabled={!text.trim()} loading={busy} onClick={submit} />
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}

export function ComposeProvider({ children }) {
  const [state, setState] = useState(null); // { tribe } | null
  const openCompose = useCallback((tribe = null) => setState({ tribe }), []);
  return (
    <ComposeContext.Provider value={{ openCompose }}>
      {children}
      {state && <ComposeSheet initialTribe={state.tribe} onClose={() => setState(null)} />}
    </ComposeContext.Provider>
  );
}

export const useCompose = () => {
  const ctx = useContext(ComposeContext);
  if (!ctx) throw new Error("useCompose must be used within ComposeProvider");
  return ctx;
};

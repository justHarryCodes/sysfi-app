"use client";
// Create Tribe — port of CreateTribeScreen: images, name, description,
// genre, privacy and (for private tribes) token gating on any supported
// network. The gate's contract is read on-chain first (public RPCs, Alchemy
// fallback) so the tribe stores real name/symbol/decimals and its chainId.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Contract, isAddress } from "ethers";
import {
  IoCameraOutline,
  IoImageOutline,
  IoGlobeOutline,
  IoLockClosed,
  IoKeyOutline,
  IoCheckmarkCircle,
  IoCube,
  IoDiamondOutline,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useChain } from "@/contexts/ChainContext";
import { invalidateEverywhere } from "@/lib/cache/queryClient";
import { CHAIN_LIST } from "@/lib/config";
import { getProvider } from "@/lib/chain/rpc";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { createTribe, GENRES } from "@/lib/tribeApi";
import { uploadImage, validateImageFile } from "@/lib/upload";
import { tribeKeys } from "@/hooks/tribes";

const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];

function ImagePick({ label, preview, onPick, aspect, Icon }) {
  return (
    <label className={`relative block cursor-pointer overflow-hidden bg-surface ${aspect}`}>
      <input type="file" accept="image/*" className="sr-only" onChange={onPick} aria-label={label} />
      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-text-tertiary">
          <Icon size={26} />
          <span className="text-xs font-semibold">{label}</span>
        </span>
      )}
    </label>
  );
}

export default function CreateTribePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showAlert, showLoading, updateLoading, hideLoading } = useFeedback();
  const { activeChain } = useChain();

  const [logo, setLogo] = useState(null); // { file, url }
  const [banner, setBanner] = useState(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState(null);
  const [privacy, setPrivacy] = useState("public");
  const [gateChain, setGateChain] = useState(activeChain);
  const [tokenType, setTokenType] = useState("Token");
  const [tokenAddress, setTokenAddress] = useState("");
  const [minTokenAmount, setMinTokenAmount] = useState("1");
  const [tokenInfo, setTokenInfo] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(
    () => () => {
      if (logo?.url) URL.revokeObjectURL(logo.url);
    },
    [logo],
  );
  useEffect(
    () => () => {
      if (banner?.url) URL.revokeObjectURL(banner.url);
    },
    [banner],
  );

  const pick = (setter) => (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const bad = validateImageFile(f);
    if (bad) return showAlert("Error", bad);
    setter({ file: f, url: URL.createObjectURL(f) });
  };

  const verifyToken = async () => {
    setTokenInfo(null);
    if (!isAddress(tokenAddress.trim())) return setErrors((p) => ({ ...p, tokenAddress: "Enter a valid contract address" }));
    setVerifying(true);
    try {
      const c = new Contract(tokenAddress.trim(), TOKEN_ABI, getProvider(gateChain));
      const [n, s] = await Promise.all([c.name(), c.symbol()]);
      const decimals = tokenType === "Token" ? Number(await c.decimals()) : undefined;
      setTokenInfo({ name: n, symbol: s, decimals });
      setErrors((p) => ({ ...p, tokenAddress: null }));
    } catch {
      setErrors((p) => ({ ...p, tokenAddress: `No ${tokenType === "Token" ? "ERC-20 token" : "NFT collection"} found at this address on ${gateChain.name}.` }));
    } finally {
      setVerifying(false);
    }
  };

  const validate = () => {
    const e = {};
    if (!name.trim()) e.name = "Tribe name is required";
    else if (name.trim().length < 3) e.name = "Name must be at least 3 characters";
    if (!description.trim()) e.description = "Description is required";
    if (!genre) e.genre = "Pick a genre";
    if (!logo) e.logo = "Add a logo";
    if (!banner) e.banner = "Add a banner";
    if (privacy === "private") {
      if (!tokenInfo) e.tokenAddress = e.tokenAddress || "Verify the gating token first";
      if (tokenType === "Token" && !(parseFloat(minTokenAmount) > 0)) e.minTokenAmount = "Enter an amount greater than 0";
    }
    setErrors(e);
    return !Object.keys(e).length;
  };

  const submit = async (ev) => {
    ev.preventDefault();
    if (!validate()) return;
    try {
      showLoading("Uploading logo…", { step: 1, totalSteps: 3 });
      const logoUrl = (await uploadImage(logo.file, "tribe-images", { publicId: `tribe_logo_${Date.now()}` })).url;
      updateLoading("Uploading banner…", 2);
      const bannerUrl = (await uploadImage(banner.file, "tribe-images", { publicId: `tribe_banner_${Date.now()}` })).url;
      updateLoading("Creating tribe…", 3);
      const tribe = await createTribe({
        name: name.trim(),
        description: description.trim(),
        genre,
        privacy,
        logoUrl,
        bannerUrl,
        tokenGating:
          privacy === "private"
            ? {
                tokenType,
                tokenAddress: tokenAddress.trim(),
                minTokenAmount: tokenType === "Token" ? minTokenAmount : "1",
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                chainId: gateChain.id,
                ...(tokenType === "Token" && { decimals: tokenInfo.decimals }),
              }
            : null,
      });
      invalidateEverywhere(qc, tribeKeys.mine(user?.uid));
      hideLoading();
      router.replace(`/tribe/${tribe.id}`);
    } catch (err) {
      hideLoading();
      showAlert("Couldn't create tribe", err.message || "Please try again.");
    }
  };

  return (
    <>
      <PageHeader title="Create Tribe" backHref="/tribes" />
      <form onSubmit={submit} noValidate className="pb-8">
        {/* Banner + logo */}
        <div className="relative mb-14">
          <ImagePick label="Add banner" preview={banner?.url} onPick={pick(setBanner)} aspect="aspect-[3/1]" Icon={IoImageOutline} />
          <div className="absolute -bottom-10 left-4 h-[88px] w-[88px] overflow-hidden rounded-2xl border-4 border-background">
            <ImagePick label="Logo" preview={logo?.url} onPick={pick(setLogo)} aspect="h-full w-full" Icon={IoCameraOutline} />
          </div>
        </div>
        {(errors.logo || errors.banner) && <p className="-mt-2 mb-3 px-4 text-xs text-error">{[errors.logo, errors.banner].filter(Boolean).join(" · ")}</p>}

        <div className="mx-auto max-w-[640px] px-4">
          <Input label="Tribe Name" placeholder="Enter tribe name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} error={errors.name} />
          <Input
            label="Description"
            placeholder="Describe your tribe..."
            multiline
            rows={4}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            error={errors.description}
          />

          <p className="mb-2 text-sm font-medium text-text-secondary">Genre</p>
          <div className="mb-1 flex flex-wrap gap-2" role="group" aria-label="Genre">
            {GENRES.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={genre === g}
                onClick={() => setGenre(g)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  genre === g ? "bg-primary text-on-primary" : "bg-hover text-text-secondary hover:text-text"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
          <p className="mb-4 min-h-4 text-xs text-error">{errors.genre}</p>

          <p className="mb-2 text-sm font-medium text-text-secondary">Privacy</p>
          <div className="mb-4 grid grid-cols-2 gap-3">
            {[
              { id: "public", Icon: IoGlobeOutline, title: "Public", body: "Anyone can find and join." },
              { id: "private", Icon: IoLockClosed, title: "Private", body: "Token-gated: members must hold a token." },
            ].map(({ id, Icon, title, body }) => (
              <button
                key={id}
                type="button"
                aria-pressed={privacy === id}
                onClick={() => setPrivacy(id)}
                className={`rounded-2xl border-2 p-4 text-left transition-colors ${
                  privacy === id ? "border-primary bg-primary/5" : "border-border hover:border-text-tertiary"
                }`}
              >
                <Icon size={22} className={privacy === id ? "text-primary" : "text-text-tertiary"} />
                <p className="mt-2 font-bold text-text">{title}</p>
                <p className="text-xs text-text-secondary">{body}</p>
              </button>
            ))}
          </div>

          {privacy === "private" && (
            <div className="mb-6 rounded-2xl border border-primary/25 bg-primary/5 p-4">
              <p className="mb-3 flex items-center gap-2 font-bold text-text">
                <IoKeyOutline size={18} className="text-primary" /> Token Gating Setup
              </p>
              <p className="mb-2 text-sm font-medium text-text-secondary">Network</p>
              <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Gating network">
                {CHAIN_LIST.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={gateChain.id === c.id}
                    onClick={() => {
                      setGateChain(c);
                      setTokenInfo(null);
                    }}
                    className={`flex items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-3 text-sm font-semibold transition-colors ${
                      gateChain.id === c.id ? "bg-primary text-on-primary" : "bg-hover text-text-secondary hover:text-text"
                    }`}
                  >
                    <ChainIcon chain={c} size={18} />
                    {c.shortName}
                  </button>
                ))}
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2">
                {[
                  { id: "Token", Icon: IoDiamondOutline },
                  { id: "NFT", Icon: IoCube },
                ].map(({ id, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={tokenType === id}
                    onClick={() => {
                      setTokenType(id);
                      setTokenInfo(null);
                    }}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold ${
                      tokenType === id ? "bg-primary text-on-primary" : "bg-hover text-text-secondary"
                    }`}
                  >
                    <Icon size={16} /> {id === "Token" ? "ERC-20 Token" : "NFT"}
                  </button>
                ))}
              </div>
              <Input
                label={`${tokenType === "Token" ? "Token" : "NFT collection"} contract (${gateChain.name})`}
                placeholder="0x…"
                value={tokenAddress}
                onChange={(e) => {
                  setTokenAddress(e.target.value);
                  setTokenInfo(null);
                }}
                onBlur={() => tokenAddress && verifyToken()}
                error={errors.tokenAddress}
                inputClassName="font-mono text-sm"
                rightIcon={tokenInfo ? <IoCheckmarkCircle size={20} className="text-primary" /> : null}
              />
              {tokenInfo ? (
                <p className="-mt-2 mb-4 text-sm text-text">
                  {tokenInfo.name} <span className="text-text-tertiary">({tokenInfo.symbol})</span>
                </p>
              ) : (
                <Button title="Verify contract" size="small" variant="secondary" loading={verifying} onClick={verifyToken} className="-mt-1 mb-4" />
              )}
              {tokenType === "Token" && (
                <Input
                  label="Minimum balance to join"
                  inputMode="decimal"
                  value={minTokenAmount}
                  onChange={(e) => setMinTokenAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                  error={errors.minTokenAmount}
                  hint={tokenInfo ? `Members need at least ${minTokenAmount || 0} ${tokenInfo.symbol}.` : undefined}
                />
              )}
            </div>
          )}

          <Button type="submit" title="Create Tribe" fullWidth />
        </div>
      </form>
    </>
  );
}

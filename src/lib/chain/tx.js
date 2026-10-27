// lib/chain/tx.js — building, estimating and sending transfers. The signer
// always comes from WalletContext.withSigner(), so the key exists only for
// the duration of `sendPrepared`.
import { Contract, Interface, formatUnits, parseUnits } from "ethers";
import { ERC20_ABI, NFT_ABI, getProvider } from "./rpc";
import { isUserRejection } from "@/lib/errors";

const erc20 = new Interface(ERC20_ABI);
const nft = new Interface(NFT_ABI);

/**
 * Describes a transfer as a plain tx request.
 *   token: { isNative, address, decimals }   or   nft: { address, tokenId, tokenType }
 */
export function buildTransfer({ from, to, amount, token, nft: nftItem }) {
  if (nftItem) {
    const data =
      nftItem.tokenType === "ERC1155"
        ? nft.encodeFunctionData("safeTransferFrom(address,address,uint256,uint256,bytes)", [from, to, nftItem.tokenId, 1, "0x"])
        : nft.encodeFunctionData("safeTransferFrom(address,address,uint256)", [from, to, nftItem.tokenId]);
    return { from, to: nftItem.address, data, value: 0n };
  }
  const units = parseUnits(String(amount), token.decimals ?? 18);
  if (token.isNative) return { from, to, value: units };
  return { from, to: token.address, data: erc20.encodeFunctionData("transfer", [to, units]), value: 0n };
}

/**
 * Gas limit (+20% headroom) and EIP-1559 fees. `fee` is the worst-case
 * network fee in wei (gasLimit × maxFeePerGas) — what the review sheet shows
 * and what "Max" reserves for native sends.
 */
export async function estimateTx(chain, request) {
  const provider = getProvider(chain);
  const [gas, feeData] = await Promise.all([provider.estimateGas(request), provider.getFeeData()]);
  const gasLimit = (gas * 120n) / 100n;
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice;
  const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?? 0n;
  const fee = gasLimit * maxFeePerGas;
  return { gasLimit, maxFeePerGas, maxPriorityFeePerGas, fee, feeFormatted: formatUnits(fee, chain.decimals) };
}

/** Sends a prepared request with a signer and waits for one confirmation. */
export async function sendPrepared(signer, request, estimate) {
  const tx = await signer.sendTransaction({
    to: request.to,
    data: request.data,
    value: request.value,
    gasLimit: estimate?.gasLimit,
    maxFeePerGas: estimate?.maxFeePerGas,
    maxPriorityFeePerGas: estimate?.maxPriorityFeePerGas,
  });
  const receipt = await tx.wait(1);
  if (receipt?.status !== 1) throw Object.assign(new Error("Transaction reverted"), { hash: tx.hash, code: "REVERTED" });
  return { hash: tx.hash, receipt };
}

/** Raw ERC-20 balance check before sending (guards against stale cache). */
export async function readErc20Balance(chain, token, owner) {
  return new Contract(token, ERC20_ABI, getProvider(chain)).balanceOf(owner);
}

/** Friendlier copy for DelegatedDAO / DAOFactory require() messages. */
const REVERT_HINTS = {
  "Must be token holder": "You need to hold this DAO's governance token.",
  "Below proposal threshold": "Your token balance is below this DAO's proposal threshold.",
  "Insufficient DAO funds": "The DAO treasury doesn't hold enough tokens for this.",
  "Already voted": "You've already voted on this proposal.",
  "Delegated vote": "You've delegated your votes. Revoke the delegation to vote yourself.",
  "No voting power": "You need governance tokens to vote.",
  "Proposal not active": "Voting on this proposal has closed.",
  "Voting period ongoing": "Voting is still open. Finalize once the voting period ends.",
  "No votes cast": "Nobody voted, so this proposal can't be finalized.",
  "Timelock not expired": "The timelock hasn't passed yet.",
  "Only creator or owner": "Only the proposal's creator can cancel it.",
  "Delegatee must hold tokens": "The delegate must hold the governance token.",
  "Chained delegation not allowed": "That address has delegated its own votes, so it can't receive yours.",
  "Cannot delegate as delegatee": "Others have delegated to you, so you can't delegate onward.",
  "Already delegated": "You've already delegated. Revoke it first.",
  "Incorrect ETH fee sent": "The creation fee changed. Reload and try again.",
  "Timelock too short": "The timelock is shorter than this factory allows.",
  "Token fee transfer failed": "Couldn't collect the token fee. Check your balance and approval.",
};

/** Human-readable error, in the spirit of the app's Web3ErrorParser. */
export function describeTxError(err) {
  if (err?.code === "USER_CANCELLED" || isUserRejection(err)) return null;
  if (err?.code === "WALLET_NOT_CONNECTED" || err?.code === "WRONG_WALLET") return { title: "Check your wallet", message: err.message };
  const msg = (err?.shortMessage || err?.info?.error?.message || err?.message || "").toLowerCase();
  if (err?.code === "INSUFFICIENT_FUNDS" || msg.includes("insufficient funds"))
    return { title: "Not enough for network fees", message: "You need a little of this network's gas token (ETH, BNB, POL, HYPE or USDC) to pay the fee." };
  if (msg.includes("transfer amount exceeds balance") || msg.includes("exceeds balance"))
    return { title: "Insufficient balance", message: "You don't have enough of this token for that amount." };
  if (err?.code === "NONCE_EXPIRED" || msg.includes("nonce"))
    return { title: "Transaction conflict", message: "Another transaction from this wallet is pending. Wait a moment and try again." };
  // A require() message from the contract (e.g. "Below proposal threshold").
  if (err?.code === "CALL_EXCEPTION" && err?.reason)
    return { title: "Transaction would fail", message: REVERT_HINTS[err.reason] ?? err.reason };
  if (err?.code === "REVERTED" || err?.code === "CALL_EXCEPTION")
    return { title: "Transaction reverted", message: "The network rejected this transaction. Check the details and try again." };
  if (err?.code === "NETWORK_ERROR" || err?.code === "TIMEOUT" || msg.includes("failed to fetch"))
    return { title: "Network problem", message: "Couldn't reach the network. Check your connection and try again." };
  return { title: "Transaction failed", message: err?.shortMessage || err?.message || "Something went wrong." };
}

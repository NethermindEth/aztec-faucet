import { nonceManager, type Hex } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

/**
 * The faucet's L1 account, always built with viem's process-wide nonce
 * manager. ETH and Fee Juice drips send from this one wallet, possibly
 * concurrently; an account built without the nonce manager grabs the same
 * pending nonce as the others and the sends collide.
 */
export function getFaucetL1Account(privateKey: Hex): PrivateKeyAccount {
  return privateKeyToAccount(privateKey, { nonceManager });
}

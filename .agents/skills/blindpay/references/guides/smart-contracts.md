# Smart Contracts

## USDB Test Token Contract

USDB is a fake ERC20 stablecoin powered by BlindPay for testing payouts on development instances.

### Contract Code

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract USDB is ERC20 {
  constructor() ERC20("USDB", "USDB") {
    _mint(msg.sender, 5000 * 10 ** 18);
  }

  function mintUSDB(uint256 amount) external {
    _mint(msg.sender, amount);
  }
}
```

### Deployed Addresses

| Network | Address |
|---------|---------|
| Sepolia | 0x8Cb65c1334b348E8d486AC935a784967AAEbB6e3 |
| Arbitrum Sepolia | 0x4D423D2cfB373862B8E12843B6175752dc75f795 |
| Base Sepolia | 0x4D423D2cfB373862B8E12843B6175752dc75f795 |
| Polygon Amoy | 0x587C3D85C9272484A6e40a8300290F55a4D5a589 |

//SPDX-License-Identifier: MIT
pragma solidity 0.8.16;

//1. Create a decentralized NFT marketplace
//    1. listItem: List NFTs on the marketplace -
//    2. buyItem: Buy the NFTs -
//    3. cancelItem: Cancel a listing -
//    4. updateListing: Update Price
//    5. withdrawProceeds: Withdraw payment for my bought NFTs

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

error NFTMarketplace__PriceMustBeAboveZero();
error NFTMarketplace__NotApprovedForMarketplace();
error NFTMarketplace__AlreadyListed(address nftAddress, uint256 tokenId);
error NFTMarketplace__NotOwner();
error NFTMarketplace__NotListed(address nftAddress, uint256 tokenId);
error NFTMarketplace__PriceNotMet(address nftAddress, uint256 tokenId, uint256 price);
error NFTMarketplace__NoProceeds();
error NFTMarketplace__TransferFailed();

contract NFTMarketplace is ReentrancyGuard {
    struct Listing {
        uint256 price;
        address seller;
    }

    // EVENTS
    event ItemListed(address indexed seller, address indexed nftAddress, uint256 indexed tokenId, uint256 price);
    event ItemBought(address indexed buyer, address indexed nftAddress, uint256 indexed tokenId, uint256 price);
    event ItemCanceled(address indexed owner, address indexed nftAddress, uint256 indexed tokenId);

    // NFT Contract address -> NFT TokenId -> Listing
    mapping(address => mapping(uint256 => Listing)) private s_listings;
    // Seller address => Amount earned
    mapping(address => uint256) private s_proceeds;

    // MODIFIERS
    modifier notListed(address nftAddress, uint256 tokenId, address owner) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if(listing.price > 0) {
            revert NFTMarketplace__AlreadyListed(nftAddress, tokenId);
        }
        _;
    }

    modifier isOwner(address nftAddress, uint256 tokenId, address spender) {
        IERC721 nft = IERC721(nftAddress);
        address owner = nft.ownerOf(tokenId);
        if (spender != owner) {
            revert NFTMarketplace__NotOwner();
        }
        _;
    }

    modifier isListed(address nftAddress, uint256 tokenId) {
        Listing memory listing = s_listings[nftAddress][tokenId];
        if(listing.price <= 0) {
            revert NFTMarketplace__NotListed(nftAddress, tokenId);
        }
        _;
    }

   // MAIN FUNCTIONS

    /*
    * @notice Method for listing yout NFT on marketplace
    * @param nftAddress: Address of the NFT
    * @param tokenId: The Token ID of the NFT
    * @param price: Sale price of the listed NFT
    * @dev Technically, we could have contract be the escrow for the NFTs
    * but this way people can still hold their NFTs when listed
    */

   // Challenge: Have this contract accept payment in a subset of tokens as well
   // Hint: Use Chainlink Price Feeds to convert the price of the tokens between each other
    function listItem(address nftAddress, uint256 tokenId, uint256 price) external notListed(nftAddress, tokenId, msg.sender) isOwner(nftAddress, tokenId, msg.sender) {
        if(price <= 0) {
            revert NFTMarketplace__PriceMustBeAboveZero();
        }
        // 1. Send the NFT to the contract. Transfer -> Contract "hold the NFT" ----> gas expensive / owner of NFT will be marketplace
        // 2. Owners can still hold their NFTs and give the marketplace approval to sell the NFT for them
        IERC721 nft = IERC721(nftAddress);
        if(nft.getApproved(tokenId) != address(this)) {
            revert NFTMarketplace__NotApprovedForMarketplace();
        }
        s_listings[nftAddress][tokenId] = Listing(price, msg.sender);
        emit ItemListed(msg.sender, nftAddress, tokenId, price);
    }

    function buyItem(address nftAddress, uint256 tokenId) external payable nonReentrant isListed(nftAddress, tokenId) {
        Listing memory listedItem = s_listings[nftAddress][tokenId];
        if(msg.value < listedItem.price) {
            revert NFTMarketplace__PriceNotMet(nftAddress, tokenId, listedItem.price);
        }
        //  We don't just send the seller the money
        // Pull over push pattern --> shift the risk associated with transferring ether to the user

        // Sending the money to the user  NOT
        // Have the users withdraw money
        s_proceeds[listedItem.seller] = s_proceeds[listedItem.seller] + msg.value;
        delete (s_listings[nftAddress][tokenId]);
        IERC721(nftAddress).safeTransferFrom(listedItem.seller, msg.sender, tokenId);
        // check to make sure the NFT was transfered
        emit ItemBought(msg.sender, nftAddress, tokenId, listedItem.price);
    }

    function cancelListing(address nftAddress, uint256 tokenId) 
        external 
        isOwner(nftAddress, tokenId, msg.sender) 
        isListed(nftAddress, tokenId) {
            delete (s_listings[nftAddress][tokenId]);
            emit ItemCanceled(msg.sender, nftAddress, tokenId);
        }

    function updateListing(address nftAddress, uint256 tokenId, uint256 newPrice)
        external
        isOwner(nftAddress, tokenId, msg.sender)
        isListed(nftAddress, tokenId) {
            s_listings[nftAddress][tokenId].price = newPrice;
            emit ItemListed(msg.sender, nftAddress, tokenId, newPrice);
        }

    function withdrawProceeds() external {
        uint256 proceeds = s_proceeds[msg.sender];
        if (proceeds <= 0) {
            revert NFTMarketplace__NoProceeds();
        }
        s_proceeds[msg.sender] = 0;
        (bool success, ) = payable(msg.sender).call{value: proceeds}("");
        if (!success) {
            revert NFTMarketplace__TransferFailed();
        }
    }

    // GETTER FUNCTIONS

    function getListing(address nftAddress, uint256 tokenId) external view returns (Listing memory) {
        return s_listings[nftAddress][tokenId];
    }

    function getProceeds(address seller) external view returns (uint256) {
        return s_proceeds[seller];
    }
}
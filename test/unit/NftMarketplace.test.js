const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name) 
    ? describe.skip       
    : describe("NFT Marketplace Tests", function () {
        let nftMarketplace, basicNft, deployer, player
        const PRICE = ethers.utils.parseEther("0.1")
        const TOKEN_ID = 0
        beforeEach(async function() {
            //deployer = (await getNamedAccounts()).deployer
            //player = (await getNamedAccounts()).player
            const accounts = await ethers.getSigners()
            deployer = accounts[0]
            player = accounts[1]
            await deployments.fixture(["all"])
            nftMarketplace = await ethers.getContract("NFTMarketplace")
            //nftMarketplace = await nftMarketplace.connect(player)
            basicNft = await ethers.getContract("BasicNFT")
            await basicNft.mintNFT()
            await basicNft.approve(nftMarketplace.address, TOKEN_ID)
        })


        it("List and can be bought", async function () {
            await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
            const playerConnectedNftMarketplace = nftMarketplace.connect(player)
            await playerConnectedNftMarketplace.buyItem(basicNft.address, TOKEN_ID, {value: PRICE})
            const newOwner = await basicNft.ownerOf(TOKEN_ID)
            const deployerProceeds = await nftMarketplace.getProceeds(deployer.address)
            assert(newOwner.toString() == player.address)
            assert(deployerProceeds.toString() == PRICE.toString())
        })

        describe("List item", function () {
            it("Emits an event after listing an item", async function () {
                expect(await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.emit("ItemListed")
            })
            it("Already listed error", async () => {
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                const error = `NFTMarketplace__AlreadyListed("${basicNft.address}", ${TOKEN_ID})`
                await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith(error)
            })
            it("Only owner can authorize", async () => {
                nftMarketplace = nftMarketplace.connect(player)
                await basicNft.approve(player.address, TOKEN_ID)
                await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith("NFTMarketplace__NotOwner")
            })
            it("Needs approvals to be listed", async () => {
                await basicNft.approve(ethers.constants.AddressZero, TOKEN_ID)
                await expect(nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith("NFTMarketplace__NotApprovedForMarketplace")
            })
            it("Updates listing with seller and price", async () => {
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                assert(listing.price.toString() == PRICE.toString())
                assert(listing.seller.toString() == deployer.address)
            })
        })

        describe("Buy item", function () {
            it("Reverts if the item is not listed", async function () {
                await expect(nftMarketplace.buyItem(basicNft.address, TOKEN_ID)).to.be.revertedWith("NFTMarketplace__NotListed")
            })
            it("Reverts if the price is not met", async () => {
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                await expect(nftMarketplace.buyItem(basicNft.address, TOKEN_ID)).to.be.revertedWith("NFTMarketplace__PriceNotMet")
            })
            it("Transfers the NFT to the buyer and updates internal proceeds record", async function () {
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                nftMarketplace = nftMarketplace.connect(player)
                expect(await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, {value: PRICE})).to.emit("ItemBought")
                const newOwner = await basicNft.ownerOf(TOKEN_ID)
                const deployerProceeds = await nftMarketplace.getProceeds(deployer.address)
                assert(newOwner.toString() == player.address)
                assert(deployerProceeds.toString() == PRICE.toString())
            })
        })
        describe("Update listing", function () {
            it("Must be owner and listed", async () => {
                await expect(nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith("NFTMarketplace__NotListed")
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                nftMarketplace = nftMarketplace.connect(player)
                await expect(nftMarketplace.updateListing(basicNft.address, TOKEN_ID, PRICE)).to.be.revertedWith("NFTMarketplace__NotOwner")
            })
            it("Updates the price of the NFT", async () => {
                const updatedPrice = ethers.utils.parseEther("0.2")
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                expect(await nftMarketplace.updateListing(basicNft.address, TOKEN_ID, updatedPrice)).to.emit("ItemListed")
                const listing = await nftMarketplace.getListing(basicNft.address, TOKEN_ID)
                assert(listing.price.toString() == updatedPrice.toString())
            })
        })

        describe("Withdraw proceeds", function () {
            it("Does not allow 0 proceed withdraws", async () => {
                await expect(nftMarketplace.withdrawProceeds()).to.be.revertedWith("NFTMarketplace__NoProceeds")
            })
            it("Proceeds can be withdrawn", async () => {
                await nftMarketplace.listItem(basicNft.address, TOKEN_ID, PRICE)
                nftMarketplace = nftMarketplace.connect(player)
                await nftMarketplace.buyItem(basicNft.address, TOKEN_ID, {value: PRICE})
                nftMarketplace = nftMarketplace.connect(deployer)

                const deployerProceedsBefore = await nftMarketplace.getProceeds(deployer.address)
                const deployerBalanceBefore = await deployer.getBalance()
                const txResponse = await nftMarketplace.withdrawProceeds()
                const txReceipt = await txResponse.wait(1)
                const { gasUsed, effectiveGasPrice } = txReceipt
                const gasCost = gasUsed.mul(effectiveGasPrice)
                const deployerBalanceAfter = await deployer.getBalance()

                assert(deployerBalanceAfter.add(gasCost).toString() == deployerProceedsBefore.add(deployerBalanceBefore).toString())
            })
        })
    })
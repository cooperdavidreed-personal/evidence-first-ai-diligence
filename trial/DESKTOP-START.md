# Underwriting Desk — desktop trial

The desktop package includes the application and its runtime. You do not need Terminal, Linux, Git, Node, an API key, or a separate server installation.

## Open the Desk

**Windows:** download `Underwriting-Desk-Windows.exe`, keep it in a folder you can find again, and double-click it. Open that same file whenever you want to return.

**Mac:** download the Apple Silicon or Intel ZIP for your Mac, unzip it, and drag **Underwriting Desk.app** to Applications (or your user Applications folder). Double-click the app.

The Desk opens in your browser. Keep the application running while working. Use **Quit Desk** in the top bar to close its local service. Closing the browser tab alone does not quit the service.

These are pilot builds, without a trusted publisher certificate or Apple notarization. If your computer or firm blocks the app, ask IT to approve the package. Do not disable computer security or grant an AI tool full permissions to work around the block.

## Connect Claude

1. Have Claude Desktop installed and signed in with your existing subscription.
2. In the Desk's setup screen, click **Open Claude extension**. Approve the Underwriting Desk extension in Claude. Your organization may need to allow custom desktop extensions first.
3. Back in the Desk, click **Create connection test**, then **Copy test prompt**. Paste it into a new Claude conversation with Underwriting Desk enabled.
4. When the Desk shows **Connection verified**, click **Open my workspace**.

The test does not share company materials. The Desk will not mark setup as verified just because a settings file was downloaded. You can also choose **Continue without Claude** and connect later from **Connection setup**.

If your computer does not associate `.mcpb` files with Claude, import the separately supplied `Underwriting Desk.mcpb` through Claude Desktop's extension settings. If your organization does not offer that option, send the extension and this guide to your administrator. There is no need to edit a JSON configuration file.

## First review

Click **New deal**, name the company, and add available materials. Start with the supplied synthetic trial notes or another non-confidential example. Confirm financial mappings where required. Release only the evidence you want Claude to read. Ask Claude to propose a first review, then adopt, edit, or dismiss its work in the Desk.

Your existing deal records remain in your user account's `.underwriting-desk` folder. Installing a newer app version preserves that database. Use the Desk's encrypted company backup before changing computers. Do not delete that data folder when replacing the app.

## What has been checked

The Apple Silicon package has been exercised on a Mac with no Node executable on PATH: extracted application, wizard, packaged extension binary, connection test, company persistence, shutdown and reopening. The extension manifest passes Anthropic's MCPB validator.

Native Windows, Intel Mac, Claude's actual extension import, firm installation policy, and an independent analyst trial still require checks on the intended workstation. This package does not automate organizational approval or purchase subscriptions. There are no Desk-operated model inference charges.

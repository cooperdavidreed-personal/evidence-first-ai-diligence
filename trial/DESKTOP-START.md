# Underwriting Desk — desktop trial

The desktop package includes the application and its runtime. You do not need Terminal, Linux, Git, Node, an API key, or a separate server installation.

## Open the Desk

**Windows:** download `Underwriting-Desk-Windows.exe`, keep it in a folder you can find again, and double-click it. Open that same file whenever you want to return.

**Mac:** download the Apple Silicon or Intel ZIP for your Mac, unzip it, and drag **Underwriting Desk.app** to Applications (or your user Applications folder). Double-click the app.

The Desk opens in your browser. It does not open a separate native analysis window. If its tab does not appear, check the browser you normally use. The app also saves **Open Underwriting Desk.html** in your `.underwriting-desk` folder with the current local address. Keep the application running while working. Use **Quit Desk** in the top bar to close its local service. Closing the browser tab alone does not quit the service.

These are pilot builds, without a trusted publisher certificate or Apple notarization. If your computer or firm blocks the app, ask IT to approve the package. Do not disable computer security or grant an AI tool full permissions to work around the block.

## Connect Claude

1. Have Claude Desktop installed and signed in with your existing subscription.
2. In the Desk's setup screen, click **Open Claude extension**. Approve the Underwriting Desk extension in Claude. Your organization may need to allow custom desktop extensions first.
3. Back in the Desk, click **Create connection test**, then **Copy test prompt**. Paste it into a new Claude conversation with Underwriting Desk enabled.
4. When the Desk shows **Connection verified**, click **Open my workspace**.

Keep the Desk open while Claude runs the test. If the code expires, click **Start a fresh test** and copy the new prompt. An expired or previously used code cannot verify a connection.

The test does not share company materials. The Desk will not mark setup as verified just because a settings file was downloaded. You can also choose **Continue without Claude** and connect later from **Connection setup**.

If Claude does not open, expand **Claude did not open, or the extension is missing?** in the Desk and click **Download Claude extension**. In Claude Desktop, go to **Settings → Extensions → Advanced settings → Install extension**. Select the downloaded `Underwriting Desk.mcpb`, review its preview and approve the installation. This download comes from your running Desk version. If your organization does not offer that option, send the extension and this guide to your administrator. There is no need to edit a JSON configuration file.

## First review

Choose **New deal → Try monthly operating review** to try a fictional company before adding your own materials. Review the revised July package, inspect the cash cell, add the liquidity question to diligence, revisit the prior conclusion in Brief, and prepare a Partner update in Committee.


Click **New deal**, name the company, and add available materials. Start with the supplied synthetic trial notes or another non-confidential example. Confirm financial mappings where required. Release only the evidence you want Claude to read. Ask Claude to propose a first review, then adopt, edit, or dismiss its work in the Desk.

Your existing deal records remain in your user account's `.underwriting-desk` folder. Installing a newer app version preserves that database. Use the Desk's encrypted company backup before changing computers. Do not delete that data folder when replacing the app.

## Updating an earlier version

Click **Quit Desk** first. Replace the old application with this download, then open it. Open **Connection setup → Open Claude extension** and choose **Update** in Claude if offered. Your existing local deal records are retained. Use the extension supplied by this app; avoid enabling a duplicate older Desk connector for the same task.

## Feedback

Where did you need help? Which mappings or conclusions needed correction? Did the next delivery reveal what needed revisiting? What work would you stop doing manually if you kept using this? A short screen recording or rough notes are enough.

## What has been checked

The Apple Silicon package has been exercised on a Mac with no Node executable on PATH: extracted application, wizard, packaged extension binary, connection test, company persistence, shutdown and reopening. The extension manifest passes Anthropic's MCPB validator.

Claude Desktop extension installation, connection verification, released synthetic evidence retrieval, and submission of two proposals were exercised in the actual client. Version 0.3.4 also passed the corrected deal-list call in Claude. Native Windows, Intel Mac, firm installation policy, and an independent analyst trial still require checks on the intended workstation. This package does not automate organizational approval or purchase subscriptions. There are no Desk-operated model inference charges.

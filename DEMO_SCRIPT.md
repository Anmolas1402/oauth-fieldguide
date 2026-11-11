# Demo script (about 3 minutes)

Setup before the call: app running (`npm run dev` or the deployed URL), header shows
"Live research on", one browser tab on the home page. Have a second tab ready with the saved
Gmail guide (`#/saved/gmail`) in case the live run is slow.

## 0:00 The problem (20 s)

> "Before you build an integration, you need to know whether it's a 20-minute form or a six-week
> review, and whether you even need your own OAuth app. Composio manages OAuth apps for some
> providers and not others. This tool answers that for any provider, with sources."

## 0:20 Start a live run on a provider that is not an example (40 s)

Type **Xero** and press **Investigate provider**. While it runs, narrate the progress screen:

- "Identify the provider" and "Check Composio managed OAuth" finish in about a second. They read
  Composio's public catalogue and the Xero toolkit page; no model is involved. The card on the right
  says managed OAuth is **Not available**, so registering your own app is **Required**.
- "Find and read official provider documentation" lists each search and each page as it is actually
  retrieved, with its size. Point out that a failed search or a 404 shows up here too.

> "Nothing on this screen is a timer. Each row is emitted by the server when that request finishes."

## 1:00 Read a guide (60 s)

While Xero finishes, switch to the saved **Gmail** guide (or stay on Xero if it has finished).

- **Decision snapshot:** managed app available, own app optional. Effort and provider review sit in
  separate boxes. The review timeline only shows a number when the provider publishes one, and it
  carries its quote.
- **Setup steps:** each step has where, who, and evidence. Tick a box to show progress is kept.
- **Agent vs. human:** "nothing is labelled automated. Secrets, terms and review submissions are you only."

## 2:00 Why you can trust it (40 s)

Open **6. Sources and confidence**.

- Every source is a page this run actually retrieved, with which claims it supports.
- **Validator adjustments:** "here the model claimed something as verified, but the quote was not
  in the page it cited, so the code downgraded it to inferred. The model does not get the last word."
- Open the investigation log: searches, pages read, pages that failed.

## 2:40 Hand off (20 s)

Click **Export Markdown** and open the file, or **Copy checklist** and paste it.

> "That's the deliverable: a checklist a developer can work through, with the evidence attached and
> the open questions listed."

## If something goes wrong

- **Search blocked:** the run continues by fetching official docs directly, and says so. Use this as a
  point about honesty, not a failure.
- **Model quota or overload message:** show the error state (no fake guide is produced), then use a
  saved guide. Saved guides are labelled with their date and can be re-run live.
- **Ambiguous name:** type `Google` to show the stated assumption and the alternatives to pick.

# Family FiN — User Guide

> **Family FiN** is a personal family finance management app. It tracks accounts, transactions, income, credit cards, installments, and subscriptions — all in one place.

---

## Table of Contents

1. [Starting the App](#1-starting-the-app)
2. [Navigation & Main Interface Elements](#2-navigation--main-interface-elements)
3. [Privacy Mode](#3-privacy-mode)
4. [Dashboard](#4-dashboard)
5. [Transactions](#5-transactions)
6. [Income](#6-income)
7. [Credit Cards](#7-credit-cards)
8. [Installments](#8-installments)
9. [Subscriptions](#9-subscriptions)
10. [Settings](#10-settings)
11. [Data Management](#11-data-management)
12. [Keyboard Shortcuts](#12-keyboard-shortcuts)

---

## 1. Starting the App

The app runs via a Python web server.

### Starting the server

```bash
python3 FamilyFIN/server.py
```

Then open your browser at:

```
http://localhost:8765
```

### Data storage

Data is saved **automatically** on every change:
- **Primary storage:** SQLite database (`familyfin.db`) in the app folder — reliable, crash-safe
- **Local copy:** browser `localStorage` (shown only if the server is unavailable)
- **Automatic backups:** in the server's `backups/` folder — one per day (last 30 kept) and one before every Import or Reset (last 10 kept). Restore them via **Settings → Data → Import**.

#### Using multiple devices

Every save is checked against the version of the data on the server. If another device changed the data in the meantime, the save does **not** overwrite the newer data: the latest version is loaded automatically and a message asks you to redo your last change.

#### Security

- The server serves **only** the app's files — never the database, backups or other files in the folder.
- Your data is accessible only from the app itself, not from other websites you may have open in the browser.
- Access is allowed via `localhost`, an IP address (e.g. `192.168.68.10`) or a local name (e.g. `zimaos`, `nas.local`). For any other name (e.g. your own domain) set it at startup: `FAMILYFIN_HOSTS=nas.example.com python3 server.py`

#### Automatic migration from data.json

If a `data.json` file exists from an older version, the server automatically imports it into the SQLite database on **first startup** and then deletes it. This happens once with no action required from the user.

> ⚠️ If you open `index.html` directly (without the server), data is stored only in localStorage and may be lost if you clear your browser data.

---

## 2. Navigation & Main Interface Elements

The left sidebar contains all sections of the app:

| Icon | Section | Description |
|------|---------|-------------|
| {{home}} | **Dashboard** | Overall financial overview |
| {{tx}} | **Transactions** | Account expenses and income |
| {{income}} | **Income** | Dedicated income view |
| {{card}} | **Credit Cards** | Card transactions and installments |
| {{inst}} | **Installments** | All active card installments |
| {{sub}} | **Subscriptions** | Monthly/annual subscriptions |
| {{gear}} | **Settings** | Accounts, cards, categories |

**On mobile:** tap ☰ at the top left to open the menu.

### Top Bar

At the top of each page a toolbar shows:
- **Page title** — The name of the current section
- **Sync indicator** — ⟳ saving, ✓ saved to the server (fades after a moment), **⚠ save failed**. On ⚠ your changes are kept and resent automatically every 15″ — tap ⚠ to retry immediately
- **{{plus}} New entry** — Quick entry from any page (see below)
- **Privacy button (eye icon)** — On the right, to blur all numbers (see Section 3)

### Quick entry

The **{{plus}} New entry** button in the top bar is on **every page**. On a phone it is a round **+** next to the eye icon. It opens a small menu (from the bottom of the screen on a phone) with four options:

| Option | What it opens |
|--------|---------------|
| **Expense** | The transaction form, set to Expense |
| **Income** | The income form |
| **Card purchase** | The card transaction form. If you have more than one card, you pick the card first |
| **Transfer** | The transfer form between accounts |

The date is set to today and the cursor goes straight to the **amount**. The form remembers the **last account** you used (per device). After saving you stay on the page you were on. *Card purchase* appears only if you have cards, and *Transfer* only if you have at least two accounts.

### Appearance: Style and Theme

**Settings → Appearance** lets you choose Style, Theme and Language. Each style shows a small preview in the current theme.

**Style** — the overall look of the app:
- **Navy** (default) — dark blue menu, blue for actions
- **Sage** — light menu, teal accent, thin borders instead of shadows
- **Graphite** — neutral black-grey with indigo; amounts in a fixed-width font so decimals line up

All three share the same layout and features; only colours, fonts and details change. The **logo** (the three bars at the top left) takes the style's colour too. The app icon on the phone's home screen and in the browser tab stays fixed, because the device keeps a single icon.

**Theme**:
- **{{monitor}} Auto** (default) — follows the device setting (e.g. on macOS: System Settings → Appearance) and switches together with it
- **{{sun}} Light** — always light
- **{{moon}} Dark** — always dark

Style and theme are saved **per device** (e.g. dark on your phone, light on your computer). All charts adapt.

### Language

The **EN / EL** button in the menu, or **Settings → Appearance → Language**, switches the language across the whole app — menus, forms, charts, month pickers and the PDF Report.

---

## 3. Privacy Mode

The **eye icon** button in the top right corner activates **Privacy Mode** — useful when you want to show the app to someone else without revealing financial values.

### How it works

| State | Icon | Button appearance |
|-------|------|-------------------|
| **Normal** | Open eye | Transparent, with border |
| **Private** | Crossed-out eye | Filled with the theme's accent colour — reminds you that amounts are hidden |

Tap once to enable, again to disable. The toggle uses a **smooth blur animation** (0.3 seconds).

### What is hidden

On **all pages**, the following blur automatically:

| Section | Hidden elements |
|---------|----------------|
| **Dashboard** | Account balances (Today/Forecast), monthly Income/Expenses/Balance, card totals, charts |
| **Transactions** | Row amounts in the table, Income/Expenses/Balance summary |
| **Income** | Monthly & annual summary, row amounts |
| **Credit Cards** | Current balance, installments/month, monthly transactions, transaction amounts |
| **Installments** | Monthly charge, remaining amount, monthly installment per entry |
| **Subscriptions** | Monthly/annual cost, amount per subscription |

> 💡 Account **names**, categories, descriptions and dates remain visible — only **€ amounts** are hidden.

> ℹ️ Privacy state is **not saved** — it resets automatically to normal when you refresh the page.

---

## 4. Dashboard

The home page provides a comprehensive view of your financial situation.

> 💡 **Chart details:** On a computer, hover over a bar, segment or point; on a phone, **tap** it. A small popup shows the exact amounts. Tap anywhere else to close it. Popups are not shown in Privacy Mode.

### 4.1 Account Balances

The two **totals** across all accounts are shown in large type at the top:

- **Today:** The current balance as entered in Settings (includes all settled transactions)
- **Forecast:** Calculated balance that takes into account **only unsettled transactions**. It turns **green** when it is higher than today and **red** when it is lower. Below it, a small badge with an arrow shows the difference (e.g. *+1,121.27 €*)

A table with the same two columns for each account follows. **Cash** always comes first, then the accounts in the order they were created. Bank accounts show the bank name on a second, smaller line. Zero amounts are dimmed and negative ones are red.

> 💡 The forecast date is shown at the top right (*Forecast to …*). It is calculated automatically as the latest transaction date, capped at the end of next month.

### 4.2 Account Changes

A chart showing, for each account, where it stands **today** and where it will be at the **forecast** date, on a shared scale:
- **Ring** (hollow) = current balance
- **Dot** (filled) = forecast balance
- The **line** joining them is **green** when the balance rises and **red** when it falls
- The vertical **0 €** line is always shown, so an account heading below zero stands out at once

On the right (or on top, on a phone) you see the forecast amount and the change in euros (e.g. **▲ +860 €** or **▼ -530 €**). Tap an account to see today, forecast and the change with its percentage.

### 4.3 Daily Balances

A chart showing how each account balance evolves day by day, from **today** (left) to the last forecast date:

- Starts from the **current balance** (Settings) for each account
- Only includes **unsettled transactions** from today to the forecast end
- The line is a **step line**: it stays flat while nothing happens and jumps on the day of each transaction, exactly like your account. A **dot** marks each change
- When a balance gets close to or drops below zero, a **dashed red 0 € line** appears and the area below it is lightly shaded red — so you can see at a glance whether and when an account will go negative
- Hover (or drag your finger) across the chart: a vertical line marks the date and the popup gives the balance of **every account** on that day
- Ends at exactly the **Forecast** amount shown in ACCOUNT BALANCES

### 4.4 Monthly Transaction Balance

The **cash flow** of the **current month**: how much money came into your accounts and how much went out (transfers between accounts excluded). The month is shown at the top right and a **Cash flow** badge sits next to the title.

- **Month balance** (large figure): money in − money out, green if positive and red if negative
- Below it, a badge shows what share of income is left over (e.g. *34% of income left over*) or, if expenses are higher, by how much they exceeded income
- **Bar:** the red part is expenses and the green part is what was left over. Tap or hover over it to see the amount
- **Into / Out of your accounts:** the two monthly totals, each on its own line
- **of which card payments:** if you paid a card from an account (a transaction with the "Cards" category), the amount appears on a small line under money out
- **Why is this different from spending?** opens the bridge that explains the difference step by step (see [4.9 Payments or Spending?](#49-payments-or-spending))

### 4.5 Credit Cards (summary)

- **Total owed** (large figure): the sum of all cards for the current month, with a small line splitting it into transactions and installments
- For each card: the name, the bank and the **monthly total** (current month transactions + monthly installments)
- The **bar** under each card shows how much of the total is **transactions** (purple) and how much is **installments** (yellow). Tap or hover over it to see both amounts
- Tapping anywhere else on a card's row opens its page

### 4.6 Spending by Category

A **donut chart** showing what you spent the month on, whatever way you paid. Spending is made up of:
- Account transactions (excluding transactions with category "Cards")
- Credit card transactions
- Monthly installments (active)

Next to the chart (or below it, on a phone) a list shows category, percentage (%) and amount in €. The month's **total spending** appears in the centre. Below the title, a small line reminds you what is included, with the link **Why is this different from the balance?**, which opens the bridge for the month you are viewing. Use **‹ ›** to change month and the two buttons on the right to switch between the **donut** and **horizontal bars**.

Up to 8 categories are shown; if there are more, the smallest are grouped into "Other".

### 4.7 Monthly Spending

A **vertical bar chart** displaying total spending for each month of the selected year.

**Year selector:** Dropdown at the top right of the card — defaults to the current year. Available years are populated automatically from your data.

**Calculation logic** (same as §4.6):
- Account transactions of type Expense, excluding transfers and the "Cards" category
- Credit card transactions
- Active monthly installments — only for the **current month**

**Colour coding:**
- **Blue** (accent): current month
- **Light blue**: past months (a shade stronger when above the average)
- **Very light**: future months

**Summary** above the chart: year total, monthly average and the highest month (only months that have passed and have expenses are counted).

**Average line (Avg):** a dashed horizontal line — months above it are a shade stronger, so you can spot at once which month went over.

An amount is written only above the **current** and the **highest** month. Tap or hover over any month for the exact amount and its difference from the average. On narrow screens every other month is labelled so the names don't overlap.

### 4.8 Recent Transactions

The 6 most recent transactions. Click **"All →"** to go to the Transactions page.

### 4.9 Payments or Spending?

The dashboard shows two different "expense" amounts, because they answer two different questions:

| | Balance (cash flow) | Spending by Category / Monthly |
|---|---|---|
| Question | How much money **left your accounts**? | How much did you **spend**, and on what? |
| Account expenses | ✔ | ✔ |
| Card payment ("Cards" category) | ✔ | ✘ |
| Card purchases | ✘ | ✔ by category |
| Installments this month | ✘ | ✔ (current month only) |

When you pay your card from your account, the money leaves the account, so it counts in the balance. The purchases it pays for, though, were already counted in spending, by category, in the month they were made. If both counted, the same spending would appear twice. Since a month's card payment usually covers the previous month's purchases, the two amounts almost always differ.

**The bridge.** The *Why is this different…* links open a dialog that goes from one amount to the other:

```
  Out of your accounts             (balance)
− Card payments
+ Card purchases this month
+ Installments this month          (current month only)
= Spending this month              (centre of the category chart)
```

The result is always exactly the amount in the centre of "Spending by Category" and in the same month's bar in "Monthly Spending".

> 💡 For this to work, record the card payment from an account with the **Cards** category. The **Payment** button on the card's page fills it in automatically.

---

## 5. Transactions

The main page for recording and tracking **account expenses and income**.

### 5.1 Adding a new transaction

Click **"+ New Transaction"** (top right on the Transactions page).

Fill in the fields:

| Field | Required | Description |
|-------|----------|-------------|
| **Type** | ✅ | Expense or Income |
| **Date** | ✅ | Transaction date |
| **Amount (€)** | ✅ | Positive number |
| **Description** | ✅ | Short description |
| **Category** | — | From the category list (expense or income categories, depending on type) |
| **Account** | ✅ | The account to debit/credit |
| **Settled** | — | Whether the transaction has cleared (see §5.2) |
| **Notes** | — | Optional text |

> 💡 Changing the **Type** (Expense/Income) automatically updates the category list — showing Expense or Income categories respectively.

### 5.2 The "Settled" field

Each account transaction can be marked as **Settled**, meaning the money has actually moved to/from the account.

**How to toggle:**
- **Quick toggle (desktop):** Click the {{box}} button (1st in the Actions column) → it becomes {{check}}
- **On mobile:** Tap a transaction row → select {{check}} **Mark as Settled** or {{box}} **Unmark Settled** from the action menu
- **From the form:** Check the "Settled" checkbox when adding or editing a transaction

**Effect:**
- **Expense** {{check}} → The amount is deducted from the account balance
- **Income** {{check}} → The amount is added to the account balance
- The transaction is **excluded** from the "Forecast" balance calculation in the Dashboard (it is already reflected in the stored balance)

Clicking {{check}} again → {{box}} reverses the effect on the balance.

> ℹ️ Transactions created automatically by Subscriptions ({{sub}}) can also be marked as settled and edited normally.

### 5.3 Editing / Deleting a transaction

**Desktop** (Actions column):
- {{box}} / {{check}} — Toggle "Settled" status (affects the balance immediately)
- {{edit}} — Opens the edit form (for transfers {{tx}} it opens the transfer form — see §5.7)
- {{trash}} — Deletes the transaction immediately (if it was settled, the balance effect is automatically reversed)

**Mobile** (tap on a transaction row):
- Opens an action menu with options: **Mark as Settled / Unmark Settled**, **Edit**, **Delete**

> ↩️ **Undo delete:** After deleting a transaction, card transaction or installment, a message with an **Undo** button appears for a few seconds; it restores the entry and the balance. Undo is not available if another change was made in the meantime.

### 5.4 Copy income to next month

For transactions of type **Income**, the {{copy}} icon appears. Clicking it automatically creates a copy of the transaction with a date **+1 month** from the original (if that day does not exist in the next month, e.g. 31/01, its last day is used — 28/02).

> Useful for recurring income (salary, pension, etc.).

### 5.5 Filtering & Searching

Above the table there are 4 filters:

| Filter | Function |
|--------|----------|
| **Month** | Shows transactions for a specific month (default: current month) |
| **Account** | Filters by account (only accounts from Settings) |
| **Category** | Filters by expense/income category |
| **🔍 Search** | Free-text search in the description |

Filters **combine** with each other. Below the filters a summary bar shows:

- **Income** (green) | **Expenses** (red) | **Balance**

### 5.6 Sorting

Click any column header (**Date ↕**, **Description ↕**, **Amount ↕**) to sort. A second click reverses the order.

### 5.7 Transferring Funds Between Accounts

Click **↕ Transfer** (next to "+ New Transaction") to open the transfer form. Fill in:

| Field | Description |
|-------|-------------|
| **Date** | Date of the transfer |
| **Amount** | The amount to transfer |
| **From Account** | The account to debit |
| **To Account** | The account to credit |
| **Notes** | Optional description |

**Result:** Two linked transactions are created automatically — one debit (Expense) on the source account and one credit (Income) on the destination account. Both are marked with the {{tx}} icon and the **Transfer** category (purple).

**Settled transfer:** Check the **Settled** checkbox when creating a transfer to immediately update both account balances. Alternatively, you can mark it settled later by clicking {{box}} / {{check}} (desktop) or tapping the {{tx}} transaction row (mobile) — the action applies to **both sides** simultaneously.

**Editing a transfer:** Click {{edit}} on either side (or **Edit** in the mobile menu). You can change the date, amount, accounts, notes and status — **both** sides are updated and balances are corrected automatically.

> ⚠️ Deleting **either** side automatically deletes **both** and reverses the balance changes.

### 5.8 PDF Report

Click **📄 Report** (below the Transfer / New Transaction buttons) to generate a report of the transactions **currently displayed** in the table (i.e. with the active filters applied).

A new window opens with the report and the print dialog appears automatically.

**Report contents:**

| Section | Description |
|---------|-------------|
| **Header** | Title "Family FiN — Transaction Report", generation date & time, transaction count |
| **Filters** | Chips showing month, account, category and search term |
| **Summary** | Income / Expenses / Balance (same logic as the page summary bar) |
| **Table** | Date, Description, Category, Account, Amount (colour-coded), Settled status |
| **Footer** | App version and totals |

**How to use:**
- **Print on paper:** Click "🖨️ Print / Save as PDF" in the report window
- **Save as PDF:** In the print dialog choose "Save as PDF" (Chrome) or "PDF → Save as PDF" (Safari)
- **Send by email:** macOS → Share → Mail (from the preview window)

**Appearance:** The report uses the colours and fonts of the **style** you selected (Navy, Sage or Graphite), always in its **light** version — even when the app is in dark theme — so it prints cleanly.

> ℹ️ If the browser blocks the new window, allow pop-ups for the app's address.

---

## 6. Income

A dedicated view showing **only income** (without expenses).

### 6.1 Income Summary

- **Monthly Income:** Total income for the selected month
- **Annual (estimate):** Average monthly income over the last 12 months (counting only months with income) × 12

> ℹ️ **Transfers** between accounts do **not appear** in the income list, even though they are stored internally as incoming transactions.

### 6.2 Adding new income

Click **"+ New Income"**. The fields are the same as the transaction form (without a type selector — it is always Income).

### 6.3 Income row actions

**Desktop** (Actions column):
- {{edit}} — Edit
- {{copy}} — Copy to next month
- {{trash}} — Delete

**Mobile** (tap on an income row):
- Opens an action menu with options: **Mark as Settled / Unmark Settled**, **Copy to next month**, **Edit**, **Delete**

---

## 7. Credit Cards

Detailed view per credit card.

### 7.1 Selecting a card

At the top of the page **tabs** appear for each card defined in Settings. Click a tab to switch cards:
- **VISA** — dark blue tab
- **MASTERCARD** — dark red tab

### 7.2 Card summary

For the selected card:
- **Current Balance:** Transactions of the **selected month** (filter) + monthly installments — updates automatically when you change the month
- **Monthly Installments:** Total active & non-completed installments (/month)
- **Monthly Transactions:** Transactions of the selected month (same as the table below)

**Payment button:** Below the Current Balance a {{card}} **Payment** button is shown. Clicking it opens the new transaction form pre-filled with:
- Type: Expense
- Date: Today
- Amount: Current card balance (selected month transactions + installments)
- Description: "Payment [Card Name]"
- Category: "Cards" (if it exists in your categories)

Simply select the account and save.

### 7.3 Card installments

Active installments for the selected card are shown with:
- Progress bar (%)
- Number of paid installments / total
- Remaining installments
- Monthly amount

When an installment is **completed** (all payments made), it remains visible in the list with a green style and "**0 remaining**" — the "+1 Installment" button disappears. It is **no longer included** in balance calculations. To remove it entirely, click {{trash}}.

**Add installment:** Click **"+ Add"** (see Section 8).

### 7.4 Card transactions

A list of card transactions, sorted by date (most recent first).

**Month filter:** A month selector above the list (default: current month) lets you view transactions for any specific month.

**Add card transaction:** Click **"+ Transaction"** and fill in:
- Date, amount, description, category

> 📌 Transactions created automatically by **Subscriptions** are shown with the {{sub}} icon.

**Desktop — Transaction actions:**
- {{edit}} — Opens the edit form (date, amount, description, category)
- {{trash}} — Deletes immediately, with **Undo** available — if the transaction belongs to a subscription, it **prevents** automatic recreation

**Mobile** (tap on a card transaction row):
- Opens an action menu with **Edit** and **Delete** options.

---

## 8. Installments

Central page for tracking **all active installments** across all cards.

### 8.1 Installments Summary

- **Monthly Charge:** Sum of monthly installments for all active entries
- **Remaining Amount:** Total amount still to be paid

### 8.2 Adding a new installment

Click **"+ New Installment"**. Fill in:

| Field | Description |
|-------|-------------|
| **Description** | Purchase name (e.g. "Laptop KOTSOVOLOS") |
| **Total Amount (€)** | Full purchase value |
| **Monthly Amount (€)** | Amount per month |
| **Paid Installments** | How many have already been paid (if starting mid-way) |
| **Total Installments** | Number of installments |
| **Card** | The card this installment belongs to |
| **Store / Provider** | Optional |
| **Expense Category** | Shown in the Dashboard expenses chart |
| **Start Date** | Month of first installment — the installment is charged to the card and the totals from this month on |

### 8.3 Installment actions

- **+1 Installment** — Records one installment as paid (increments the counter). When the count is complete, the installment is **automatically deactivated**.
- {{edit}} — Edit details
- {{trash}} — Delete, with **Undo** available for a few seconds

### 8.4 Progress bar

Each installment shows a visual progress bar indicating the completion percentage (paid / total).

---

## 9. Subscriptions

Manage **monthly and annual subscriptions** with automatic transaction creation.

### 9.1 Cost summary

- **Monthly:** Total of monthly subscriptions
- **Yearly:** Total annual cost (monthly × 12 + annual)

> **Paused** subscriptions are not included.

### 9.2 Adding a new subscription

Click **"+ New Subscription"** and fill in:

| Field | Description |
|-------|-------------|
| **Service** | Name (e.g. "Netflix") |
| **Icon** | Emoji for visual recognition (e.g. 🎬) |
| **Amount (€)** | Cost per billing period |
| **Frequency** | Monthly or Yearly |
| **Card/Account** | Where it is charged |
| **Billing day** | Day of the month (1–31) |
| **Billing month** | Yearly subscriptions only — the month of the year when you are charged |
| **Expense Category** | Category applied to generated transactions |
| **Paused** | When checked, automatic transaction generation is suspended |

### 9.3 Automatic transaction creation

Each subscription **automatically creates** transactions for each month:
- If charged to a **card** → a transaction is created in Card Transactions
- If charged to an **account** → a transaction is created in Account Transactions

Automatic creation runs **every time the app is opened**, covering all months retroactively from the subscription's start date up to the current month. Automatic transactions are identified by the {{sub}} icon. If you delete such a transaction, it **will not** be recreated automatically for that month.

> 💡 Changing the **category** of a subscription automatically updates **all existing** automatic transactions associated with it.

### 9.4 Generate next month's transaction

Each subscription card shows a {{inst}} **+1** button (appears on hover on desktop, always visible on mobile). Tapping it:
- Immediately creates the subscription transaction for the **next month only**
- If the transaction already exists, a message is shown without creating a duplicate
- Useful for getting a **complete view of future balances** before the month ends

### 9.5 Pausing a Subscription

In the subscription edit form there is a **"Paused"** option:
- While active, **no automatic transactions** are generated for future months
- The subscription remains in the list with a visual **⏸ Paused** indicator (dimmed appearance)
- When unchecked, automatic transaction generation resumes normally

> ℹ️ Useful for subscriptions that are temporarily suspended (e.g. a streaming service on pause).

### 9.6 Subscription actions

- {{edit}} — Edit
- {{trash}} — Delete the subscription. Transactions already recorded are **kept** and converted to regular independent transactions

---

## 10. Settings

Central configuration of the app, in four groups: **Finances**, **Categories**, **App** and **Data**. **Changes here affect every section.**

### 10.1 Accounts

A list of your bank accounts and cash. Each row shows the name, type or bank, and balance. The header shows the **total** across all accounts.

- **Add:** {{plus}} **New** — opens a dialog for the new account
- **Edit:** {{edit}} on the account's row
- **Delete:** {{trash}} — asks for confirmation. Cards paid from that account are left with no linked account.

In the dialog you set:
- **Name** — The display name (e.g. "Payroll")
- **Type** — {{wallet}} `Cash` or {{bank}} `Bank`
- **Bank** — Bank accounts only (e.g. "Alpha Bank")
- **Balance** — Current balance in €

> ⚠️ Changing an account balance updates the Dashboard immediately.

### 10.2 Cards

A list of your credit cards. Each row shows the bank and which account pays the card.

- **Add:** {{plus}} **New**
- **Edit:** {{edit}} — Name (e.g. "VISA Gold"), Issuing Bank and **Linked Account**, from which the card is paid off
- **Delete:** {{trash}} — if the card has transactions, installments or subscriptions, you are told and they are all deleted together after confirmation

Cards appear as **tabs** on the Credit Cards page.

### 10.3 Categories

One card with an **Expenses / Income** switch (each shows how many categories it has).

- **Expenses:** used in Expense transactions, installments and subscriptions
- **Income:** used for income
- **Add:** tap {{plus}} **New**, type the name and press Enter (Esc to cancel)
- **Remove:** tap the {{x}} on the category

> ℹ️ Default expense categories include: Supermarket, Restaurant/Café, Transport, Health, Clothing, Electronics, Entertainment, Telecommunications, Energy/Water, Rent, Insurance, Loan, Children, etc. Income: Salary, Freelance, Pension, Rent (received), Allowance, Other.

### 10.4 Appearance

Style, Theme and Language — see Section 2. They are saved on the device you are using only.

### 10.5 Notifications

The **Pending expense reminders** switch turns browser notifications on or off. Below it you see the status:
- **On for this device** — with a **Test** link that sends a test notification
- **Off** — turning it on the first time asks the browser for permission
- **Blocked by the browser** — the switch is disabled; allow notifications in your browser settings

If you turn the switch off, that choice is kept on this device only.

#### How they work

- **Every time you open the app**, if there are pending expenses (not completed, dated today or earlier), **one** notification is sent per day
- A **red number (badge)** appears next to **Transactions** in the menu, showing how many expenses are pending
- If nothing is pending, no notification is sent and the badge is hidden

> ℹ️ If you dismiss the enable banner with **"Later"**, you can turn notifications on here at any time.

---

## 11. Data Management

The **Settings → Data** group has two cards: **Backups** and **Danger zone**.

### {{export}} Export

Downloads a `familyfin_backup_YYYYMMDD.json` file with **all** app data (accounts, transactions, installments, subscriptions, etc.).

> ✅ Recommended periodically as a backup.

### {{import}} Import

Loads a backup file exported earlier, or a file from the server's `backups/` folder. It **fully replaces** the current data after asking for confirmation. Files from older versions are converted automatically.

> 💾 Before importing, the server automatically keeps a copy of the current data (`backups/before-import-…json`).

### {{alert}} Reset (Danger zone)

Deletes **all** data and restores the factory defaults. Tapping **Reset** shows "Are you sure?" with **Cancel** and **Delete everything**; nothing is deleted until you press the second button. The server automatically keeps a copy (`backups/before-reset-…json`).

---

## 12. Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl + N` | Open the **New entry** menu |
| `Escape` | Close the open dialog or action menu |
| `Tab` / `Shift + Tab` | Move between fields — when a form opens, the cursor is placed in its first field automatically |

---

## Appendix — Calculation Logic

### Forecast Account Balance

```
Forecast Balance = Current Balance
               + Total unsettled Income
               − Total unsettled Expenses
```

**All unsettled** transactions up to the forecast date are included — overdue ones too (older dates), because they have not affected the balance yet. The cap is the end of next month. The "Daily Balance" chart uses exactly the same transactions, so it ends at the same amount.

### Card Total (Dashboard)

```
Card Total (month) = Current month transactions
                   + Monthly installments (active, non-completed, already started)
```

### Spending by Category Chart

Calculates for the **current month**:
1. Expense-type transactions (excluding category "Cards")
2. Credit card transactions
3. Monthly amount of active installments that have started (with their category)

Card payments from an account (category "Κάρτες" or "Cards") are excluded so the same spending is not counted twice.

---

*Family FiN — Version 0.957 Beta | Last updated: November 2026*

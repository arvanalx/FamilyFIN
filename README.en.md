# 💰 Family FiN — User Guide

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

The app runs locally via a Python web server.

### Starting the server

```bash
cd /Users/alex/Documents/Claude/FamilyFIN
python3 server.py
```

Then open your browser at:

```
http://localhost:8765
```

### Data storage

Data is saved **automatically** on every change:
- **Primary storage:** `data.json` file in the app folder (via the server)
- **Fallback storage:** browser `localStorage` (used if the server is not running)

> ⚠️ If you open `index.html` directly (without the server), data is stored only in localStorage and may be lost if you clear your browser data.

---

## 2. Navigation & Main Interface Elements

The left sidebar contains all sections of the app:

| Icon | Section | Description |
|------|---------|-------------|
| 📊 | **Dashboard** | Overall financial overview |
| 📋 | **Transactions** | Account expenses and income |
| 💵 | **Income** | Dedicated income view |
| 💳 | **Credit Cards** | Card transactions and installments |
| 📅 | **Installments** | All active card installments |
| 🔄 | **Subscriptions** | Monthly/annual subscriptions |
| ⚙️ | **Settings** | Accounts, cards, categories |

**On mobile:** tap ☰ at the top left to open the menu.

### Top Bar

At the top of each page a toolbar shows:
- **Page title** — The name of the current section
- **👁️ Privacy button** — On the right, to blur all numbers (see Section 3)

---

## 3. Privacy Mode

The **👁️** button in the top right corner activates **Privacy Mode** — useful when you want to show the app to someone else without revealing financial values.

### How it works

| State | Icon | Button appearance |
|-------|------|-------------------|
| **Normal** | 👁️ | Transparent, with border |
| **Private** | 🙈 | Solid blue — reminds you that amounts are hidden |

Tap once to enable, again to disable. The toggle uses a **smooth blur animation** (0.3 seconds).

### What is hidden

On **all pages**, the following blur automatically:

| Section | Hidden elements |
|---------|----------------|
| **Dashboard** | Account balances (Today/Future), monthly Income/Expenses/Balance, card totals, charts |
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

### 4.1 Account Balances

A table with two columns for each account:

- **Today:** The current balance as entered in Settings (includes all settled transactions)
- **Future:** Calculated balance that takes into account **only unsettled transactions** (up to the end of next month)

> 💡 The "Future" date is calculated automatically as the latest transaction date, capped at the end of next month.

Bank accounts show the bank name in parentheses in smaller text (e.g. *Payroll (Alpha Bank)*).

### 4.2 Balance Chart

A bar chart that visually shows the balances of all accounts:
- **Solid colour** = current balance (today)
- **Light colour** = future balance

Each account uses the same colour pair (e.g. dark blue / light blue) for easy identification.

### 4.3 Monthly Stats

A summary for the **current month**:
- **Income:** Total income from transactions of type "Income"
- **Expenses:** Total expenses from transactions of type "Expense"
- **Balance:** Income − Expenses (green if positive, red if negative)

### 4.4 Credit Cards (summary)

For each card:
- Current total transaction amount
- Monthly amount of active installments
- Total (transactions + installments)

### 4.5 Expenses by Category

A **donut chart** showing the distribution of expenses for the current month from:
- Account transactions (excluding transactions with category "Cards")
- Credit card transactions
- Monthly installments (active)

Each segment shows: category, percentage (%) and amount in €. The **total expenses amount** appears in the centre.

### 4.6 Recent Transactions

The 6 most recent transactions. Click **"All →"** to go to the Transactions page.

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
- **Quick toggle:** Click the **☐** button (1st in the Actions column) → it becomes **✅**
- **From the form:** Check the "Settled" checkbox when adding or editing a transaction

**Effect:**
- **Expense ✅** → The amount is deducted from the account balance
- **Income ✅** → The amount is added to the account balance
- The transaction is **excluded** from the "Future" balance calculation in the Dashboard (it is already reflected in the stored balance)

Clicking ✅ again → ☐ reverses the effect on the balance.

> ℹ️ Transactions created automatically by Subscriptions (🔄) can also be marked as settled, but have no edit button.

### 5.3 Editing / Deleting a transaction

- **☐ / ✅** — Toggle "Settled" status (affects the balance immediately)
- **✏️** — Opens the edit form (not shown for subscription transactions 🔄)
- **🗑️** — Asks for confirmation and deletes the transaction (if it was settled, the balance effect is automatically reversed)

### 5.4 Copy income to next month

For transactions of type **Income**, the **📋** icon appears. Clicking it automatically creates a copy of the transaction with a date **+1 month** from the original.

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

---

## 6. Income

A dedicated view showing **only income** (without expenses).

### 6.1 Income Summary

- **Monthly Income:** Total income for the selected month
- **Annual (estimate):** Multiplies monthly income × 12

### 6.2 Adding new income

Click **"+ New Income"**. The fields are the same as the transaction form (without a type selector — it is always Income).

### 6.3 Income row actions

- **✏️** — Edit
- **📋** — Copy to next month
- **🗑️** — Delete

---

## 7. Credit Cards

Detailed view per credit card.

### 7.1 Selecting a card

At the top of the page **tabs** appear for each card defined in Settings. Click a tab to switch cards:
- **VISA** — dark blue tab
- **MASTERCARD** — dark red tab

### 7.2 Card summary

For the selected card:
- **Current Balance:** Sum of transactions + monthly installments
- **Monthly Installments:** Total active installments (/month)
- **Monthly Transactions:** Transactions for the current month

### 7.3 Card installments

Active installments for the selected card are shown with:
- Progress bar (%)
- Number of paid installments / total
- Remaining installments
- Monthly amount

**Add installment:** Click **"+ Add"** (see Section 8).

### 7.4 Card transactions

A list of all card transactions (sorted by date, most recent first).

**Add card transaction:** Click **"+ Transaction"** and fill in:
- Date, amount, description, category

> 📌 Transactions created automatically by **Subscriptions** are shown with the 🔄 icon.

**Delete transaction:** Click **🗑️** — if the transaction belongs to a subscription, deleting it **prevents** it from being automatically recreated.

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
| **Start Date** | Month of first installment |

### 8.3 Installment actions

- **+1 Installment** — Records one installment as paid (increments the counter). When the count is complete, the installment is **automatically deactivated**.
- **✏️** — Edit details
- **🗑️** — Permanently delete

### 8.4 Progress bar

Each installment shows a visual progress bar indicating the completion percentage (paid / total).

---

## 9. Subscriptions

Manage **monthly and annual subscriptions** with automatic transaction creation.

### 9.1 Cost summary

- **Monthly:** Total of monthly subscriptions (annual ÷ 12)
- **Yearly:** Total annual cost of all subscriptions

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
| **Expense Category** | Category applied to generated transactions |

### 9.3 Automatic transaction creation

Each subscription **automatically creates** transactions for each month:
- If charged to a **card** → a transaction is created in Card Transactions
- If charged to an **account** → a transaction is created in Account Transactions

Automatic transactions are identified by the 🔄 icon. If you delete such a transaction, it **will not** be recreated automatically for that month.

> 💡 Changing the **category** of a subscription automatically updates **all existing** automatic transactions associated with it.

### 9.4 Subscription actions

- **✏️** — Edit
- **🗑️** — Delete the subscription **and** all its automatic transactions

---

## 10. Settings

Central configuration of the app. **Changes here affect all sections.**

### 10.1 Accounts

Manage bank accounts and cash.

**Add:** Click **"+ New"**.

Each account has:
- **Name** — Display name (e.g. "Payroll")
- **Type** — `Bank` or `Cash`
- **Bank** — Shown only for bank accounts (e.g. "Alpha Bank")
- **Balance** — Current balance in €

**Save:** Click **"Save"** for each account individually.

**Delete:** Click **"Delete"** (shown only if more than one account exists).

> ⚠️ Changing an account balance immediately updates the Dashboard.

### 10.2 Cards

Manage credit cards.

**Add a new card:** Click the **"+ New"** button in the section header. A new card is created with a default name which you can edit immediately.

Each card has:
- **Name** — Display name (e.g. "VISA Gold")
- **Bank** — Issuing bank (e.g. "Alpha Bank")
- **Linked Account** — The account from which the card is settled

**Save:** Click **"Save"** after each change.

**Delete:** Click **"🗑️ Delete"**. If the card has linked transactions, installments, or subscriptions, the system notifies you and deletes everything together after confirmation.

Cards appear as **tabs** on the Credit Cards page.

### 10.3 Expense Categories

List of categories used in transactions of type **Expense**, in installments, and in subscriptions.

**Add:** Type a name in the field and click **"Add"** (or press Enter).

**Delete:** Click the **✕** next to the category.

> ℹ️ Default categories include: Supermarket, Restaurant/Café, Transport, Health, Clothing, Electronics, Entertainment, Telecommunications, Energy/Water, Rent, Insurance, Loan, Children, etc.

### 10.4 Income Categories

List of categories for transactions of type **Income**.

Works exactly like Expense Categories.

> ℹ️ Defaults: Salary, Freelance, Pension, Rent (received), Allowance, Other.

---

## 11. Data Management

In the **Settings → Data** section there are three options:

### 📤 Export JSON

Downloads a `familyfin_backup_YYYYMMDD.json` file with **all** app data (accounts, transactions, installments, subscriptions, etc.).

> ✅ Recommended periodically as a backup.

### 📥 Import JSON

Loads a backup file previously exported. **Completely replaces** current data.

> ⚠️ Import is **irreversible**. Export first if you want to keep current data.

### 🗑️ Reset

Deletes **all** data and restores factory defaults. Asks for confirmation before executing.

---

## 12. Keyboard Shortcuts

| Shortcut | Function |
|----------|----------|
| `Ctrl + N` | Open new transaction form |
| `Escape` | Close open modal/dialog |

---

## Appendix — Calculation Logic

### Future Account Balance

```
Future Balance = Current Balance
               + Total Income (all future transactions)
               − Total Expenses (all future transactions)
```

All recorded transactions are taken into account regardless of date, capped at the end of next month.

### Card Total (Dashboard)

```
Card Total = Sum of card transactions
           + Sum of monthly installments (active)
```

### Expenses by Category Chart

Calculates for the **current month**:
1. Expense-type transactions (excluding category "Cards")
2. Credit card transactions
3. Monthly amount of active installments (with their category)

---

*Family FiN — Version 0.100 Beta | Last updated: March 2026*

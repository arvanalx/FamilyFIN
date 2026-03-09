/* ============================================================
   Family FiN — Internationalization (EL / EN)
   ============================================================ */

'use strict';

const TRANSLATIONS = {
  el: {
    months: ['Ιαν','Φεβ','Μαρ','Απρ','Μαΐ','Ιουν','Ιουλ','Αυγ','Σεπ','Οκτ','Νοε','Δεκ'],

    // Navigation
    nav_dashboard:     'Γρήγορη ματιά',
    nav_transactions:  'Κινήσεις',
    nav_income:        'Έσοδα',
    nav_cards:         'Πιστωτικές Κάρτες',
    nav_installments:  'Δόσεις',
    nav_subscriptions: 'Συνδρομές',
    nav_settings:      'Ρυθμίσεις',
    nav_help:          'Βοήθεια',

    // Dashboard
    dash_account_balances: 'Υπόλοιπα Λογαριασμών',
    dash_today:            'Σήμερα',
    dash_future_col:       'Μέλλον',
    dash_balance_chart:    'Γράφημα Υπολοίπων',
    dash_monthly_stats:    'Στατιστικά Μήνα',
    stat_income:           'Έσοδα',
    stat_expense:          'Έξοδα',
    stat_balance:          'Υπόλοιπο',
    dash_credit_cards:     'Πιστωτικές Κάρτες',
    dash_expense_by_cat:   'Έξοδα ανά Κατηγορία',
    dash_recent_tx:        'Τελευταίες Κινήσεις',
    dash_see_all:          'Όλες →',
    dash_no_tx:            'Δεν υπάρχουν κινήσεις ακόμα',
    dash_no_expenses:      'Δεν υπάρχουν έξοδα αυτόν τον μήνα',
    dash_total:            'Σύνολο',
    dash_installments_pm:  'δόσεις/μήνα',
    dash_total_colon:      'Σύνολο:',
    dash_subtotal:         'σύνολο',
    dash_today_label:      'σήμερα',
    dash_future_label:     'μέλλον',

    // Transactions page
    filter_all_accounts:   'Όλοι οι λογαριασμοί',
    filter_all_categories: 'Όλες οι κατηγορίες',
    search_placeholder:    '🔍 Αναζήτηση...',
    btn_new_tx:            '+ Νέα Κίνηση',
    sum_income:            'Έσοδα:',
    sum_expenses:          'Έξοδα:',
    sum_balance:           'Υπόλοιπο:',
    col_date:              'Ημερομηνία ↕',
    col_desc:              'Περιγραφή ↕',
    col_category:          'Κατηγορία',
    col_account:           'Λογαριασμός',
    col_amount_sort:       'Ποσό ↕',
    col_amount:            'Ποσό',
    col_actions:           'Ενέργειες',
    tx_empty:              'Δεν βρέθηκαν κινήσεις',

    // Income page
    btn_new_income:        '+ Νέο Έσοδο',
    income_summary:        'Σύνοψη Εσόδων',
    income_monthly:        'Μηνιαία Έσοδα',
    income_yearly:         'Ετήσια (εκτίμηση)',
    income_month_table:    'Έσοδα Μήνα',
    income_none:           'Δεν υπάρχουν έσοδα αυτόν τον μήνα',

    // Installments page
    subtitle_inst:         'Παρακολούθηση όλων των δόσεων',
    btn_new_inst:          '+ Νέα Δόση',
    inst_summary:          'Σύνοψη Δόσεων',
    inst_monthly_charge:   'Μηνιαία Επιβάρυνση',
    inst_remaining_amt:    'Εναπομείναντα Ποσό',
    inst_active:           'Ενεργές Δόσεις',
    inst_none:             'Δεν υπάρχουν δόσεις',
    inst_installments:     'δόσεις',
    inst_remaining:        'εναπομένουν',
    btn_pay_inst:          '+1 Δόση',
    per_month:             '/μήνα',

    // Subscriptions page
    subtitle_subs:         'Μηνιαίες & ετήσιες συνδρομές',
    btn_new_sub:           '+ Νέα Συνδρομή',
    sub_cost:              'Κόστος Συνδρομών',
    sub_stat_monthly:      'Μηνιαία',
    sub_stat_yearly:       'Ετήσια',
    sub_active:            'Ενεργές Συνδρομές',
    sub_none:              'Δεν υπάρχουν συνδρομές',
    freq_monthly:          'μηνιαία',
    freq_yearly:           'ετήσια',

    // Help page
    help_loading:          'Φόρτωση οδηγιών...',
    help_not_found:        'Δεν βρέθηκε το αρχείο οδηγιών.',

    // Settings page
    settings_accounts:     'Λογαριασμοί',
    btn_new_account:       '+ Νέος',
    settings_cards:        'Κάρτες',
    btn_new_card_lbl:      '+ Νέα',
    settings_expense_cats: 'Κατηγορίες Εξόδων',
    settings_income_cats:  'Κατηγορίες Εσόδων',
    settings_data:         'Δεδομένα',
    new_cat_placeholder:   'Νέα κατηγορία...',
    btn_add:               'Προσθήκη',
    btn_export:            '📤 Εξαγωγή JSON',
    btn_import:            '📥 Εισαγωγή JSON',
    btn_reset:             '🗑️ Επαναφορά',
    acc_label_name:        'Όνομα',
    acc_label_type:        'Τύπος',
    acc_type_cash:         'Μετρητά',
    acc_type_bank:         'Τραπεζικός',
    acc_label_bank:        'Τράπεζα',
    acc_label_balance:     'Υπόλοιπο (€)',
    btn_save:              'Αποθήκευση',
    card_label_name:       'Όνομα Κάρτας',
    card_label_bank:       'Τράπεζα Έκδοσης',
    card_label_linked:     'Συνδεδεμένος Λογαριασμός',
    card_none_linked:      '— Κανένας —',
    btn_delete_card:       '🗑️ Διαγραφή',

    // Modals
    modal_new_tx:       'Νέα Κίνηση',
    modal_edit_tx:      'Επεξεργασία Κίνησης',
    modal_new_income:   'Νέο Έσοδο',
    modal_new_inst:     'Νέα Δόση',
    modal_edit_inst:    'Επεξεργασία Δόσης',
    modal_new_sub:      'Νέα Συνδρομή',
    modal_edit_sub:     'Επεξεργασία Συνδρομής',
    modal_card_tx:      'Κίνηση Κάρτας',
    label_type:         'Τύπος',
    label_expense:      'Έξοδο',
    label_income_type:  'Έσοδο',
    label_date:         'Ημερομηνία *',
    label_amount:       'Ποσό (€) *',
    label_desc:         'Περιγραφή *',
    label_category:     'Κατηγορία',
    label_account_req:  'Λογαριασμός *',
    label_account:      'Λογαριασμός',
    label_notes:        'Σημειώσεις',
    notes_placeholder:  'Προαιρετικές σημειώσεις...',
    label_service:      'Υπηρεσία *',
    label_frequency:    'Συχνότητα',
    freq_monthly_opt:   'Μηνιαία',
    freq_yearly_opt:    'Ετήσια',
    label_card_account: 'Κάρτα/Λογαριασμός',
    label_billing_day:  'Ημέρα χρέωσης',
    label_expense_cat:  'Κατηγορία Εξόδου',
    label_icon:         'Εικονίδιο / Emoji',
    label_total_amt:    'Συνολικό Ποσό (€) *',
    label_monthly_amt:  'Μηνιαία Δόση (€) *',
    label_paid_count:   'Δόσεις που πληρώθηκαν',
    label_total_count:  'Συνολικές Δόσεις *',
    label_card:         'Κάρτα',
    label_store:        'Κατάστημα / Πάροχος',
    label_start_month:  'Ημερομηνία έναρξης',
    btn_cancel:         'Άκυρο',
    confirm_title:      'Επιβεβαίωση',
    btn_confirm:        'Επιβεβαίωση',

    // Credit Cards page
    cards_not_set:        'Δεν έχουν οριστεί κάρτες στις Ρυθμίσεις.',
    card_current_balance: 'Τρέχον Υπόλοιπο',
    card_monthly_inst:    'Μηνιαίες Δόσεις',
    card_monthly_tx:      'Μηνιαίες Κινήσεις',
    card_inst_hdr:        'Δόσεις',
    btn_add_inst:         '+ Προσθήκη',
    card_tx_hdr:          'Κινήσεις',
    btn_add_card_tx:      '+ Κίνηση',

    // Privacy toggle
    privacy_show: 'Εμφάνιση ποσών',
    privacy_hide: 'Απόκρυψη ποσών',

    // Toast messages
    toast_fill_required:   'Συμπλήρωσε τα υποχρεωτικά πεδία',
    toast_saved:           'Αποθηκεύτηκε ✓',
    toast_tx_deleted:      'Η κίνηση διαγράφηκε',
    toast_tx_saved:        'Η κίνηση αποθηκεύτηκε',
    toast_tx_updated:      'Η κίνηση ενημερώθηκε',
    toast_income_saved:    'Το έσοδο αποθηκεύτηκε',
    toast_copied_to:       'Αντιγράφηκε στις',
    toast_inst_saved:      'Η δόση αποθηκεύτηκε',
    toast_inst_paid:       'Δόση καταχωρήθηκε ✓',
    toast_inst_deleted:    'Η δόση διαγράφηκε',
    toast_sub_saved:       'Η συνδρομή αποθηκεύτηκε',
    toast_sub_deleted:     'Η συνδρομή και οι κινήσεις της διαγράφηκαν',
    toast_card_tx_deleted: 'Διαγράφηκε',
    toast_acc_deleted:     'Ο λογαριασμός διαγράφηκε',
    toast_card_deleted:    'Η κάρτα διαγράφηκε',
    toast_cat_added:       'Η κατηγορία προστέθηκε',
    toast_export:          'Εξαγωγή δεδομένων ✓',
    toast_import_ok:       'Τα δεδομένα εισήχθησαν ✓',
    toast_import_invalid:  'Μη έγκυρο αρχείο',
    toast_import_error:    'Σφάλμα εισαγωγής',
    toast_reset_done:      'Επαναφορά ολοκληρώθηκε',
    toast_enter_desc:      'Εισάγετε περιγραφή',
    toast_enter_acc_name:  'Εισάγετε όνομα λογαριασμού',
    toast_invalid_balance: 'Μη έγκυρο υπόλοιπο',
    toast_enter_card_name: 'Εισάγετε όνομα κάρτας',
    toast_fill_fields:     'Συμπλήρωσε τα πεδία',

    // Confirm dialogs
    confirm_del_tx:       'Διαγραφή Κίνησης',
    confirm_del_tx_msg:   'Να διαγραφεί οριστικά αυτή η κίνηση;',
    confirm_del_sub_tx:   'Να διαγραφεί αυτή η αυτόματη κίνηση συνδρομής;\nΔεν θα ξαναδημιουργηθεί.',
    confirm_del_inst:     'Διαγραφή Δόσης',
    confirm_del_inst_msg: 'Να διαγραφεί αυτή η δόση;',
    confirm_del_sub:      'Διαγραφή Συνδρομής',
    confirm_del_sub_msg:  'Να διαγραφεί αυτή η συνδρομή;\nΘα διαγραφούν επίσης όλες οι αυτόματες κινήσεις της.',
    confirm_del_acc:      'Διαγραφή Λογαριασμού',
    confirm_del_acc_msg:  'Να διαγραφεί αυτός ο λογαριασμός;',
    confirm_del_card:     'Διαγραφή Κάρτας',
    confirm_reset:        'Επαναφορά Δεδομένων',
    confirm_reset_msg:    'Θα διαγραφούν ΟΛΑ τα δεδομένα. Συνέχεια;',

    // Misc dynamic strings
    account_new:      'Νέος Λογαριασμός',
    card_new:         'Νέα Κάρτα',
    auto_sub_note:    'Αυτόματη συνδρομή',
    no_category:      'Χωρίς κατηγορία',
    no_cat_option:    '— Χωρίς κατηγορία —',
    installments_cat: 'Δόσεις',
    subscriptions_cat:'Συνδρομές',
    linked_card_tx:   'συναλλαγές',
    linked_inst:      'δόσεις',
    linked_subs:      'συνδρομές',

    // Dynamic confirm messages (use tf() for substitution)
    confirm_del_card_tx_msg:       'Να διαγραφεί αυτή η κίνηση κάρτας;',
    confirm_del_card_msg_simple:   'Να διαγραφεί η κάρτα "{0}";',
    confirm_del_card_msg_extras:   'Η κάρτα "{0}" και οι συνδεδεμένες {1} της θα διαγραφούν οριστικά.',
  },

  en: {
    months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],

    // Navigation
    nav_dashboard:     'Dashboard',
    nav_transactions:  'Transactions',
    nav_income:        'Income',
    nav_cards:         'Credit Cards',
    nav_installments:  'Installments',
    nav_subscriptions: 'Subscriptions',
    nav_settings:      'Settings',
    nav_help:          'Help',

    // Dashboard
    dash_account_balances: 'Account Balances',
    dash_today:            'Today',
    dash_future_col:       'Future',
    dash_balance_chart:    'Balance Chart',
    dash_monthly_stats:    'Monthly Stats',
    stat_income:           'Income',
    stat_expense:          'Expenses',
    stat_balance:          'Balance',
    dash_credit_cards:     'Credit Cards',
    dash_expense_by_cat:   'Expenses by Category',
    dash_recent_tx:        'Recent Transactions',
    dash_see_all:          'All →',
    dash_no_tx:            'No transactions yet',
    dash_no_expenses:      'No expenses this month',
    dash_total:            'Total',
    dash_installments_pm:  'installments/mo',
    dash_total_colon:      'Total:',
    dash_subtotal:         'total',
    dash_today_label:      'today',
    dash_future_label:     'future',

    // Transactions page
    filter_all_accounts:   'All accounts',
    filter_all_categories: 'All categories',
    search_placeholder:    '🔍 Search...',
    btn_new_tx:            '+ New Transaction',
    sum_income:            'Income:',
    sum_expenses:          'Expenses:',
    sum_balance:           'Balance:',
    col_date:              'Date ↕',
    col_desc:              'Description ↕',
    col_category:          'Category',
    col_account:           'Account',
    col_amount_sort:       'Amount ↕',
    col_amount:            'Amount',
    col_actions:           'Actions',
    tx_empty:              'No transactions found',

    // Income page
    btn_new_income:        '+ New Income',
    income_summary:        'Income Summary',
    income_monthly:        'Monthly Income',
    income_yearly:         'Annual (estimate)',
    income_month_table:    'Monthly Income',
    income_none:           'No income this month',

    // Installments page
    subtitle_inst:         'Track all your installments',
    btn_new_inst:          '+ New Installment',
    inst_summary:          'Installments Summary',
    inst_monthly_charge:   'Monthly Charge',
    inst_remaining_amt:    'Remaining Amount',
    inst_active:           'Active Installments',
    inst_none:             'No installments',
    inst_installments:     'installments',
    inst_remaining:        'remaining',
    btn_pay_inst:          '+1 Installment',
    per_month:             '/mo',

    // Subscriptions page
    subtitle_subs:         'Monthly & annual subscriptions',
    btn_new_sub:           '+ New Subscription',
    sub_cost:              'Subscription Cost',
    sub_stat_monthly:      'Monthly',
    sub_stat_yearly:       'Yearly',
    sub_active:            'Active Subscriptions',
    sub_none:              'No subscriptions',
    freq_monthly:          'monthly',
    freq_yearly:           'yearly',

    // Help page
    help_loading:  'Loading guide...',
    help_not_found:'Guide file not found.',

    // Settings page
    settings_accounts:     'Accounts',
    btn_new_account:       '+ New',
    settings_cards:        'Cards',
    btn_new_card_lbl:      '+ New',
    settings_expense_cats: 'Expense Categories',
    settings_income_cats:  'Income Categories',
    settings_data:         'Data',
    new_cat_placeholder:   'New category...',
    btn_add:               'Add',
    btn_export:            '📤 Export JSON',
    btn_import:            '📥 Import JSON',
    btn_reset:             '🗑️ Reset',
    acc_label_name:        'Name',
    acc_label_type:        'Type',
    acc_type_cash:         'Cash',
    acc_type_bank:         'Bank',
    acc_label_bank:        'Bank',
    acc_label_balance:     'Balance (€)',
    btn_save:              'Save',
    card_label_name:       'Card Name',
    card_label_bank:       'Issuing Bank',
    card_label_linked:     'Linked Account',
    card_none_linked:      '— None —',
    btn_delete_card:       '🗑️ Delete',

    // Modals
    modal_new_tx:       'New Transaction',
    modal_edit_tx:      'Edit Transaction',
    modal_new_income:   'New Income',
    modal_new_inst:     'New Installment',
    modal_edit_inst:    'Edit Installment',
    modal_new_sub:      'New Subscription',
    modal_edit_sub:     'Edit Subscription',
    modal_card_tx:      'Card Transaction',
    label_type:         'Type',
    label_expense:      'Expense',
    label_income_type:  'Income',
    label_date:         'Date *',
    label_amount:       'Amount (€) *',
    label_desc:         'Description *',
    label_category:     'Category',
    label_account_req:  'Account *',
    label_account:      'Account',
    label_notes:        'Notes',
    notes_placeholder:  'Optional notes...',
    label_service:      'Service *',
    label_frequency:    'Frequency',
    freq_monthly_opt:   'Monthly',
    freq_yearly_opt:    'Yearly',
    label_card_account: 'Card/Account',
    label_billing_day:  'Billing day',
    label_expense_cat:  'Expense Category',
    label_icon:         'Icon / Emoji',
    label_total_amt:    'Total Amount (€) *',
    label_monthly_amt:  'Monthly Amount (€) *',
    label_paid_count:   'Paid Installments',
    label_total_count:  'Total Installments *',
    label_card:         'Card',
    label_store:        'Store / Provider',
    label_start_month:  'Start Date',
    btn_cancel:         'Cancel',
    confirm_title:      'Confirm',
    btn_confirm:        'Confirm',

    // Credit Cards page
    cards_not_set:        'No cards defined in Settings.',
    card_current_balance: 'Current Balance',
    card_monthly_inst:    'Monthly Installments',
    card_monthly_tx:      'Monthly Transactions',
    card_inst_hdr:        'Installments',
    btn_add_inst:         '+ Add',
    card_tx_hdr:          'Transactions',
    btn_add_card_tx:      '+ Transaction',

    // Privacy toggle
    privacy_show: 'Show amounts',
    privacy_hide: 'Hide amounts',

    // Toast messages
    toast_fill_required:   'Please fill required fields',
    toast_saved:           'Saved ✓',
    toast_tx_deleted:      'Transaction deleted',
    toast_tx_saved:        'Transaction saved',
    toast_tx_updated:      'Transaction updated',
    toast_income_saved:    'Income saved',
    toast_copied_to:       'Copied to',
    toast_inst_saved:      'Installment saved',
    toast_inst_paid:       'Installment recorded ✓',
    toast_inst_deleted:    'Installment deleted',
    toast_sub_saved:       'Subscription saved',
    toast_sub_deleted:     'Subscription and its transactions deleted',
    toast_card_tx_deleted: 'Deleted',
    toast_acc_deleted:     'Account deleted',
    toast_card_deleted:    'Card deleted',
    toast_cat_added:       'Category added',
    toast_export:          'Data exported ✓',
    toast_import_ok:       'Data imported ✓',
    toast_import_invalid:  'Invalid file',
    toast_import_error:    'Import error',
    toast_reset_done:      'Reset complete',
    toast_enter_desc:      'Please enter a description',
    toast_enter_acc_name:  'Please enter account name',
    toast_invalid_balance: 'Invalid balance',
    toast_enter_card_name: 'Please enter card name',
    toast_fill_fields:     'Please fill the fields',

    // Confirm dialogs
    confirm_del_tx:       'Delete Transaction',
    confirm_del_tx_msg:   'Delete this transaction permanently?',
    confirm_del_sub_tx:   'Delete this auto subscription transaction?\nIt will not be recreated.',
    confirm_del_inst:     'Delete Installment',
    confirm_del_inst_msg: 'Delete this installment?',
    confirm_del_sub:      'Delete Subscription',
    confirm_del_sub_msg:  'Delete this subscription?\nAll its auto-generated transactions will also be deleted.',
    confirm_del_acc:      'Delete Account',
    confirm_del_acc_msg:  'Delete this account?',
    confirm_del_card:     'Delete Card',
    confirm_reset:        'Reset Data',
    confirm_reset_msg:    'ALL data will be deleted. Continue?',

    // Misc dynamic strings
    account_new:      'New Account',
    card_new:         'New Card',
    auto_sub_note:    'Auto subscription',
    no_category:      'Uncategorized',
    no_cat_option:    '— Uncategorized —',
    installments_cat: 'Installments',
    subscriptions_cat:'Subscriptions',
    linked_card_tx:   'transactions',
    linked_inst:      'installments',
    linked_subs:      'subscriptions',

    // Dynamic confirm messages (use tf() for substitution)
    confirm_del_card_tx_msg:       'Delete this card transaction?',
    confirm_del_card_msg_simple:   'Delete card "{0}"?',
    confirm_del_card_msg_extras:   'Card "{0}" and its linked {1} will be permanently deleted.',
  },
};

// ── Language helpers ──────────────────────────────────────────

function getLang() {
  return localStorage.getItem('familyfin_lang') || 'el';
}

function setLang(lang) {
  localStorage.setItem('familyfin_lang', lang);
  document.documentElement.lang = lang;
  applyTranslations();
  // Clear help cache so it re-fetches in new language
  const helpContent = document.getElementById('helpContent');
  if (helpContent) delete helpContent.dataset.loaded;
  // Re-render current page (via showPage to also update the page title)
  if (typeof showPage === 'function' && typeof currentPage === 'function') {
    showPage(currentPage());
  }
}

function toggleLang() {
  setLang(getLang() === 'el' ? 'en' : 'el');
}

function t(key) {
  const lang = getLang();
  const dict = TRANSLATIONS[lang];
  if (dict && dict[key] !== undefined) return dict[key];
  return TRANSLATIONS.el[key] !== undefined ? TRANSLATIONS.el[key] : key;
}

// Template function: tf('key', arg0, arg1, ...) replaces {0}, {1}, ... in translated string
function tf(key, ...args) {
  let s = t(key);
  args.forEach((a, i) => { s = s.replace(new RegExp('\\{' + i + '\\}', 'g'), a); });
  return s;
}

function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  // Update lang toggle button label
  const btn = document.getElementById('langToggle');
  if (btn) btn.textContent = getLang() === 'el' ? 'EN' : 'EL';
  // Update html lang attribute
  document.documentElement.lang = getLang();
}

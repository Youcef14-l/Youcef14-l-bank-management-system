package dev.youcef.bank_management_system.account;

import java.math.BigDecimal;
import java.util.List;

import dev.youcef.bank_management_system.money.Money;

public class AccountService {

    public Account findByAccountNumber(List<Account> accounts, String accountNumber) {
        for (Account account : accounts) {
            if (account.getAccountNumber().equals(accountNumber)) {
                return account;
            }
        }
        return null;
    }

    // deposit
    public void deposit(Account account, BigDecimal amount) {
        checkAmount(amount);
        checkActive(account);

        Money balance = account.getBalance();
        balance.setAmount(balance.getAmount().add(amount));
    }

    // ---------- WITHDRAW ----------
    public void withdraw(Account account, BigDecimal amount) {
        checkAmount(amount);
        checkActive(account);

        Money balance = account.getBalance();
        if (balance.getAmount().compareTo(amount) < 0) {
            throw new IllegalStateException("Insufficient funds");
        }
        balance.setAmount(balance.getAmount().subtract(amount));
    }

    // ---------- TRANSFER ----------
    public void transfer(Account from, Account to, BigDecimal amount) {
        if (from == to) {
            throw new IllegalArgumentException("Cannot transfer to the same account");
        }
        if (from.getBalance().getCurrency() != to.getBalance().getCurrency()) {
            throw new IllegalArgumentException("Accounts must have the same currency");
        }
        checkActive(to); // check the receiver BEFORE taking money from the sender

        withdraw(from, amount); // validates amount, status, and funds for the sender
        deposit(to, amount);
    }

    // ---------- helpers ----------
    private void checkAmount(BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Amount must be greater than zero");
        }
    }

    private void checkActive(Account account) {
        if (account == null) {
            throw new IllegalArgumentException("Account not found");
        }
        if (account.getStatus() != AccountStatus.ACTIVE) {
            throw new IllegalStateException("Account is not active");
        }
    }
}
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


        Money balance = account.getBalance();
        balance.setAmount(balance.getAmount().add(amount));
    }

    // ---------- WITHDRAW ----------
    public void withdraw(Account account, BigDecimal amount) {

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


        withdraw(from, amount); // validates amount, status, and funds for the sender
        deposit(to, amount);
    }

    // ---------- helpers ----------



}
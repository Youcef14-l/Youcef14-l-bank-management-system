package dev.youcef.bank_management_system.transaction;

import java.time.LocalDateTime;

import dev.youcef.bank_management_system.account.Account;
import dev.youcef.bank_management_system.money.Money;

public class Transaction {
    private Long id;
    private String reference;
    private TransactionType type;
    private Money amount;
    private LocalDateTime timestamp;
    private String description;
    private Account account;
}

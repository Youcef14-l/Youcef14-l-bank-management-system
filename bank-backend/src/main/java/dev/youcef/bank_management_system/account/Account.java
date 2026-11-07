package dev.youcef.bank_management_system.account;

import java.time.LocalDateTime;
import dev.youcef.bank_management_system.customer.Customer;
import dev.youcef.bank_management_system.money.Money;
import dev.youcef.bank_management_system.money.Currency;


public class Account {

    private Long id;
    private String accountNumber;
    private Money balance;
    private AccountType accountType;
    private AccountStatus status;
    private Currency currency;
    private Customer customer;
    private LocalDateTime createdAt; 
    public Account(){ 
    }
    //constructor 
    public Account(long id, String accountNumber, Money balance, AccountType accountType, AccountStatus status,
        Currency currency, Customer customer, LocalDateTime createdAt) { 
            this.id = id; 
            this.accountNumber = accountNumber; 
            this.balance = balance; 
            this.accountType = accountType; 
            this.status = status;
            this.currency = currency; 
            this.customer = customer; 
            this.createdAt =  createdAt; 
    }  

    //getter 
    public long getId() {
        return id;
    } 
    public String getAccountNumber(){ 
        return accountNumber;
    } 
    public Money getBalance(){ 
        return balance;  
    } 
    public AccountType getAccountType(){ 
        return accountType;
    }  
    public AccountStatus getStatus(){ 
        return status;
    }
    public Currency getCurrency() { 
        return currency; 
    } 
    public Customer getCustomer(){ 
        return customer;
    } 
    public LocalDateTime getCreatedAt(){ 
        return createdAt;
    } 
    //setter
    public void setId(long id) {
        this.id = id;
    } 
    public void setAccountNumber(String accountNumber){ 
        this.accountNumber = accountNumber;
    } 
    public void setBalance(Money balance){ 
        this.balance = balance;
    } 
    public void setAccountType(AccountType accountType){ 
        this.accountType = accountType;
    }  
    public void setStatus(AccountStatus status){ 
        this.status = status;
    }
    public void setCurrency(Currency currency) { 
        this.currency = currency;
    } 
    public void setCustomer(Customer customer){ 
        this.customer = customer;
    } 
    public void setCreatedAt(LocalDateTime createdAt){ 
        this.createdAt =  createdAt;
    } 

}

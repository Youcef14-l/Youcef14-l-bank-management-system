package dev.youcef.bank_management_system.money;

import java.math.BigDecimal;

public class Money {
    private BigDecimal amount;
    private Currency currency; 

    //constructor 
    public Money(BigDecimal amount, Currency currency) { 
        this.amount = amount; 
        this.currency = currency;
    } 
    //getter 
    public BigDecimal getAmount(){ 
        return amount;
    } 
    public Currency getCurrency(){ 
        return currency;
    } 
    //setter 
    public void setAmount(BigDecimal amount){ 
        this.amount = amount; 
    } 
    public void setCurrency(Currency currency){ 
        this.currency = currency; 
    }
}

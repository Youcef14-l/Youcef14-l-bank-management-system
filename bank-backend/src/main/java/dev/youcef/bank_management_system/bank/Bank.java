package dev.youcef.bank_management_system.bank;

// java imports
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

// account imports
import dev.youcef.bank_management_system.account.Account;
import dev.youcef.bank_management_system.account.AccountStatus;
import dev.youcef.bank_management_system.account.AccountType;
// customer imports
import dev.youcef.bank_management_system.customer.Customer;
import dev.youcef.bank_management_system.customer.CustomerType;
// money imports
import dev.youcef.bank_management_system.money.Currency;
import dev.youcef.bank_management_system.money.Money;
// transaction import
import dev.youcef.bank_management_system.transaction.Transaction;

public class Bank {

    private final List<Customer> customers = new ArrayList<>();
    private final List<Account> accounts = new ArrayList<>();
    private final List<Transaction> transactions = new ArrayList<>();

    public Bank() {
        loadSampleData();
    }

    // Statements must live inside a method or constructor, not directly in the class body
    private void loadSampleData() {

        // 1. Create customers
        Customer nehal = new Customer();
        nehal.setId(1L);
        nehal.setFirstName("Nehal");
        nehal.setLastName("Abdelnour");
        nehal.setEmail("abdelnour@gmail.com");
        nehal.setPhone("0550123456");
        nehal.setCustomerType(CustomerType.INDIVIDUAL);

        Customer youcef = new Customer();
        youcef.setId(2L);
        youcef.setFirstName("Youcef");
        youcef.setLastName("Larbi");
        youcef.setEmail("youcef@gmail.com");
        youcef.setPhone("0660123456");
        youcef.setCustomerType(CustomerType.INDIVIDUAL);

        // 2. Add customers to the list
        customers.add(nehal);
        customers.add(youcef);

        // 3. Create accounts
        Account account1 = new Account();
        account1.setId(1L);
        account1.setAccountNumber("ACC-001");
        account1.setBalance(new Money(new BigDecimal("15000.00"), Currency.DZD));
        account1.setAccountType(AccountType.SAVINGS);
        account1.setStatus(AccountStatus.ACTIVE);
        account1.setCustomer(nehal);

        Account account2 = new Account();
        account2.setId(2L);
        account2.setAccountNumber("ACC-002");
        account2.setBalance(new Money(new BigDecimal("25000.00"), Currency.DZD));
        account2.setAccountType(AccountType.CURRENT);
        account2.setStatus(AccountStatus.ACTIVE);
        account2.setCustomer(nehal);

        Account account3 = new Account();
        account3.setId(3L);
        account3.setAccountNumber("ACC-003");
        account3.setBalance(new Money(new BigDecimal("500.00"), Currency.EUR));
        account3.setAccountType(AccountType.SAVINGS);
        account3.setStatus(AccountStatus.ACTIVE);
        account3.setCustomer(youcef);

        // 4. Add accounts to the list
        accounts.add(account1);
        accounts.add(account2);
        accounts.add(account3);
    }

    // Display all information
    public void displayData() {

        System.out.println("\n========== BANK CUSTOMERS ==========");

        for (Customer customer : customers) {
            System.out.println("\nCustomer ID: " + customer.getId());
            System.out.println("Name: " + customer.getFirstName() + " " + customer.getLastName());
            System.out.println("Email: " + customer.getEmail());
            System.out.println("Phone: " + customer.getPhone());
        }

        System.out.println("\n========== BANK ACCOUNTS ==========");

        for (Account account : accounts) {
            System.out.println("\nAccount Number: " + account.getAccountNumber());
            System.out.println("Owner: " + account.getCustomer().getFirstName()
                    + " " + account.getCustomer().getLastName());
            System.out.println("Type: " + account.getAccountType());
            System.out.println("Status: " + account.getStatus());
            System.out.println("Balance: " + account.getBalance().getAmount()
                    + " " + account.getBalance().getCurrency());
        }
    }

    // Getters
    public List<Customer> getCustomers() {
        return customers;
    }

    public List<Account> getAccounts() {
        return accounts;
    }

    public List<Transaction> getTransactions() {
        return transactions;
    }
}
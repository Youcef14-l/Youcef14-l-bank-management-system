package dev.youcef.bank_management_system.bank;

// java imports
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Scanner;

// account imports
import dev.youcef.bank_management_system.account.Account;
import dev.youcef.bank_management_system.account.AccountService;
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

    private final AccountService service = new AccountService();
    private final Scanner scanner = new Scanner(System.in);

    public Bank() {
        loadSampleData();
    }


   

    //sample data
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

        Customer amine = new Customer();
        amine.setId(3L);
        amine.setFirstName("Amine");
        amine.setLastName("kerada");
        amine.setEmail("amine@gmail.com");
        amine.setPhone("055404393");
        amine.setCustomerType(CustomerType.INDIVIDUAL);

        // 2. Add customers to the list
        customers.add(nehal);
        customers.add(youcef);
        customers.add(amine);

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

    // ===================== MENU =====================
    public void run() {
        boolean running = true;

        while (running) {
            printMenu();
            String choice = scanner.nextLine().trim();

            try {
                switch (choice) {
                    case "1" -> displayData();
                    case "2" -> withdraw();
                    case "3" -> deposit();
                    case "4" -> transfer();
                    case "0" -> running = false;
                    default -> System.out.println("Invalid choice, try again.");
                }
            } catch (IllegalArgumentException | IllegalStateException e) {
                System.out.println("Error: " + e.getMessage());
            }
        }

        System.out.println("Goodbye!");
    }

    private void printMenu() {
        System.out.println("\n===== BANK MENU =====");
        System.out.println("1. Display all data");
        System.out.println("2. Withdraw");
        System.out.println("3. Deposit");
        System.out.println("4. Transfer");
        System.out.println("0. Exit");
        System.out.print("Choose: ");
    }

    // ===================== OPERATIONS =====================
    private void deposit() {
        Account account = readAccount("Account number: ");
        BigDecimal amount = readAmount();

        service.deposit(account, amount);

        System.out.println("Deposit successful.");
        printAccount(account);
    }

    private void withdraw() {
        Account account = readAccount("Account number: ");
        BigDecimal amount = readAmount();

        service.withdraw(account, amount);

        System.out.println("Withdraw successful.");
        printAccount(account);
    }

    private void transfer() {
        Account from = readAccount("From account number: ");
        Account to = readAccount("To account number: ");
        BigDecimal amount = readAmount();

        service.transfer(from, to, amount);

        System.out.println("Transfer successful.");
        printAccount(from);
        printAccount(to);
    }

    // ===================== INPUT HELPERS =====================
    private Account readAccount(String message) {
        System.out.print(message);
        String number = scanner.nextLine().trim();

        Account account = service.findByAccountNumber(accounts, number);
        if (account == null) {
            throw new IllegalArgumentException("Account not found: " + number);
        }
        return account;
    }

    private BigDecimal readAmount() {
        System.out.print("Amount: ");
        String text = scanner.nextLine().trim();

        try {
            return new BigDecimal(text);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Invalid amount: " + text);
        }
    }

    // ===================== DISPLAY =====================
    private void printAccount(Account account) {
        System.out.println("--------------------------");
        System.out.println("Account: " + account.getAccountNumber());
        System.out.println("Owner:   " + account.getCustomer().getFirstName()
                + " " + account.getCustomer().getLastName());
        System.out.println("Balance: " + account.getBalance().getAmount()
                + " " + account.getBalance().getCurrency());
        System.out.println("--------------------------");
    }

    // Display all information
public void displayData() {

    System.out.println("\n========== BANK CUSTOMERS AND ACCOUNTS ==========");

    for (Customer customer : customers) {
        System.out.println("\n----------------------------------------");
        System.out.println("Customer ID: " + customer.getId());
        System.out.println("Name: " + customer.getFirstName() + " " + customer.getLastName());
        System.out.println("Email: " + customer.getEmail());
        System.out.println("Phone: " + customer.getPhone());

        boolean hasAccount = false;

        for (Account account : accounts) {
            if (Objects.equals(account.getCustomer().getId(), customer.getId())) {
                hasAccount = true;
                System.out.println("\n   Account Number: " + account.getAccountNumber());
                System.out.println("   Type: " + account.getAccountType());
                System.out.println("   Status: " + account.getStatus());
                System.out.println("   Balance: " + account.getBalance().getAmount()
                        + " " + account.getBalance().getCurrency());
            }
        }

        if (!hasAccount) {
            System.out.println("\n   (No accounts)");
        }
    }
}

    // getters 
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
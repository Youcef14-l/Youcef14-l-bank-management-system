package dev.youcef.bank_management_system;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;

import dev.youcef.bank_management_system.bank.Bank;

@SpringBootApplication
public class BankManagementSystemApplication {

    public static void main(String[] args) {
        SpringApplication.run(
            BankManagementSystemApplication.class, args
        );
    }

    @Bean
    CommandLineRunner run() {
        return args -> {
            Bank bank = new Bank();
            bank.displayData();
        };
    }
}
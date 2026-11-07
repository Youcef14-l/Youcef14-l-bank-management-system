package dev.youcef.bank_management_system.customer;

import java.time.LocalDateTime;

public class Customer {

    private long id;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String address;
    private CustomerType customerType;
    private LocalDateTime createdAt;

    // No-args constructor (Bank uses new Customer() followed by setters)
    public Customer() {
        this.createdAt = LocalDateTime.now();
    }

    // Full constructor
    public Customer(long id, String firstName, String lastName, String email,
                    String phone, String address, CustomerType customerType,
                    LocalDateTime createdAt) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.phone = phone;
        this.address = address;
        this.customerType = customerType;
        this.createdAt = createdAt;
    }

    // ==================== Getters ====================
    public long getId() {
        return id;
    }

    public String getFirstName() {
        return firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public String getEmail() {
        return email;
    }

    public String getPhone() {
        return phone;
    }

    public String getAddress() {
        return address;
    }

    public CustomerType getCustomerType() {
        return customerType;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    // ==================== Setters ====================
    public void setId(long id) {
        this.id = id;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public void setAddress(String address) {
        this.address = address;
    }

    public void setCustomerType(CustomerType customerType) {
        this.customerType = customerType;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
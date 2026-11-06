package dev.youcef.bank_management_system.model;

public class Customer {

    private int id;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;  
    private int name;
    

    // Constructor
    public Customer(int id, String firstName,
                    String lastName, String email, String phone) {

        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.phone = phone;
    }

    // Getters
    public int getId() {
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


}
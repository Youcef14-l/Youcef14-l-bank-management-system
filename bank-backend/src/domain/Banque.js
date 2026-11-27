export class Banque {
  constructor({ id, name, code, address, phone, email }) {
    this.id = id;
    this.name = name;
    this.code = code;
    this.address = address;
    this.phone = phone;
    this.email = email;
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      code: this.code,
      address: this.address,
    };
  }
}
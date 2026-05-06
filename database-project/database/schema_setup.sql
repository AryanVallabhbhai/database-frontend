CREATE DATABASE IF NOT EXISTS demo;

USE demo;

CREATE TABLE Customer (
    CustomerID INT NOT NULL,
    Name VARCHAR(50) NOT NULL,
    PRIMARY KEY (CustomerID)
);

CREATE TABLE Rewards (
    CustomerID INT NOT NULL,
    Phone_No VARCHAR(15),
    Email VARCHAR(255),
    Points INT NOT NULL DEFAULT 0,
    Joined DATE NOT NULL,
    Redeemed INT NOT NULL DEFAULT 0,
    PRIMARY KEY(CustomerID),
    FOREIGN KEY (CustomerID) REFERENCES Customer(CustomerID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (Points >= 0),
    CHECK (Redeemed >= 0),
    CONSTRAINT Check_Contact CHECK (Phone_No IS NOT NULL OR Email IS NOT NULL)
);

CREATE TABLE Orders (
    OrderID INT NOT NULL,
    Date_Time DATETIME NOT NULL,
    Method ENUM ('Online', 'Delivery', 'Dine-In') NOT NULL,
    Payment ENUM('Cash', 'Card', 'Giftcard') NOT NULL,
    CustomerID INT NOT NULL,
    PRIMARY KEY (OrderID),
    FOREIGN KEY (CustomerID) REFERENCES Customer(CustomerID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (HOUR(Date_Time) >= 9 AND HOUR(Date_Time) < 22)
);

CREATE TABLE Items (
    ItemID INT NOT NULL,
    Name VARCHAR(50) NOT NULL,
    Type ENUM('Appetizer', 'Entre', 'Side', 'Dessert', 'Drink') NOT NULL,
    Price DECIMAL(5, 2) NOT NULL,
    PRIMARY KEY (ItemID),
    CHECK (Price >= 0)
);

CREATE TABLE Employee (
    EmployeeID INT NOT NULL,
    Name VARCHAR(50) NOT NULL,
    Hired DATE NOT NULL,
    Phone_No VARCHAR(15) NOT NULL,
    Address_No INT NOT NULL,
    Street VARCHAR(50) NOT NULL,
    City VARCHAR(50) NOT NULL,
    State VARCHAR(2) NOT NULL,
    Zipcode VARCHAR(5) NOT NULL,
    Shift ENUM('Morning', 'Night') NOT NULL,
    PRIMARY KEY (EmployeeID)
);

CREATE TABLE Timesheet (
    TimeID INT NOT NULL,
    EmployeeID INT NOT NULL,
    Clock_In DATETIME NOT NULL,
    Clock_Out DATETIME NOT NULL,
    PRIMARY KEY (TimeID),
    FOREIGN KEY (EmployeeID) REFERENCES Employee(EmployeeID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (Clock_Out > Clock_In),
    CHECK (TIMESTAMPDIFF(MINUTE, Clock_In, Clock_Out) <= 480),
    CHECK (HOUR(Clock_In) >= 7 AND HOUR(Clock_In) < 21),
    CHECK (HOUR(Clock_Out) > 9 AND HOUR(Clock_Out) <= 23)
);

CREATE TABLE Manager (
    EmployeeID INT NOT NULL,
    Salary DECIMAL(8, 2) NOT NULL DEFAULT 50000,
    Office_No INT NOT NULL,
    PRIMARY KEY (EmployeeID),
    FOREIGN KEY (EmployeeID) REFERENCES Employee(EmployeeID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (Salary >= 0)
);

CREATE TABLE Chef (
    EmployeeID INT NOT NULL,
    Wage DECIMAL(5, 2) NOT NULL DEFAULT 20,
    Station_No INT NOT NULL,
    Specialization ENUM('Food', 'Extra') NOT NULL,
    PRIMARY KEY (EmployeeID),
    FOREIGN KEY (EmployeeID) REFERENCES Employee(EmployeeID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (Wage >= 0)
);

CREATE TABLE Server (
    EmployeeID INT NOT NULL,
    Wage DECIMAL(5, 2) NOT NULL DEFAULT 15,
    Section_No INT NOT NULL,
    PRIMARY KEY (EmployeeID),
    FOREIGN KEY (EmployeeID) REFERENCES Employee(EmployeeID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (Wage >= 0)
);

CREATE TABLE Cashier (
    EmployeeID INT NOT NULL,
    Wage DECIMAL(5, 2) NOT NULL DEFAULT 10,
    Register_No INT NOT NULL,
    PRIMARY KEY (EmployeeID),
    FOREIGN KEY (EmployeeID) REFERENCES Employee(EmployeeID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (Wage >= 0)
);

CREATE TABLE Contain (
    ItemID INT NOT NULL,
    OrderID INT NOT NULL,
    Quantity INT NOT NULL,
    PRIMARY KEY (ItemID, OrderID),
    FOREIGN KEY (ItemID) REFERENCES Items(ItemID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (OrderID) REFERENCES Orders(OrderID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    CHECK (Quantity >= 1)
);

CREATE TABLE Serve (
    EmployeeID INT NOT NULL,
    OrderID INT NOT NULL,
    Notes VARCHAR(255),
    PRIMARY KEY (EmployeeID, OrderID),
    FOREIGN KEY (EmployeeID) REFERENCES Employee(EmployeeID)
        ON DELETE CASCADE
        ON UPDATE CASCADE,
    FOREIGN KEY (OrderID) REFERENCES Orders(OrderID)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

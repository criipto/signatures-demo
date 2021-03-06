import React, { Component } from 'react';
import { Container, Navbar, NavbarBrand, NavbarToggler } from 'reactstrap';
import { Link } from 'react-router-dom';
import './NavMenu.css';

export class NavMenu extends Component {
  render () {
    return (
      <header>
        <Navbar className="navbar-expand-sm navbar-toggleable-sm ng-white border-bottom box-shadow mb-3" light>
          <Container>
            <NavbarBrand tag={Link} to="/">Criipto Signing Demo</NavbarBrand>
            <NavbarToggler onClick={this.toggleNavbar} className="mr-2" />
          </Container>
        </Navbar>
      </header>
    );
  }
}

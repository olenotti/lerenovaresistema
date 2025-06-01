import React from "react";
import { Drawer, List, ListItemIcon, ListItemText, ListItemButton, Typography, Box, Divider, useTheme, Badge } from "@mui/material";
import PeopleIcon from '@mui/icons-material/People';
import InventoryIcon from '@mui/icons-material/Inventory';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import ScheduleSendIcon from '@mui/icons-material/ScheduleSend';
import AssessmentIcon from '@mui/icons-material/Assessment';
import EventNoteIcon from '@mui/icons-material/EventNote';
// import EventBusyIcon from '@mui/icons-material/EventBusy'; // Ícone para Bloquear Horários - Removido
import CakeIcon from '@mui/icons-material/Cake';
import LogoutIcon from '@mui/icons-material/Logout';

const menuItems = [
  { text: 'Clientes', icon: <PeopleIcon />, id: 0, label: 'Clientes' },
  { text: 'Pacotes', icon: <InventoryIcon />, id: 1, label: 'Pacotes' },
  { text: 'Agendamentos', icon: <CalendarMonthIcon />, id: 2, label: 'Agendamentos' },
  { text: 'Consulta Cliente', icon: <PersonSearchIcon />, id: 3, label: 'Consulta Cliente' },
  { text: 'Horários Fixos', icon: <ScheduleSendIcon />, id: 4, label: 'Horários Fixos' },
  { text: 'Controle Atendimentos', icon: <AssessmentIcon />, id: 5, label: 'Controle Atendimentos' },
  { text: 'Agenda Visual', icon: <EventNoteIcon />, id: 6, label: 'Agenda Visual' },
  // { text: 'Bloquear Horários', icon: <EventBusyIcon />, id: 7, label: 'Bloquear Horários' }, // Removido
];

export default function SideMenu({ menu, setMenu, isMobile, mobileOpen, handleDrawerToggle, drawerWidth, onLogout, aniversariantesCount }) {
  const muiTheme = useTheme();
  const logoUrl = "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=544,fit=crop,q=95/Yanz3WRa3jIXbe26/comunicaassapso-visual-le-renovare-2-mp87zboQNzFJy8rV.png";

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1,
        height: { xs: '56px', sm: '64px' }
      }}>
        <Box
          component="img"
          src={logoUrl}
          alt="Le Renovare Logo"
          sx={{
            height: '100%',
            width: 'auto',
            maxHeight: '50px',
            objectFit: 'contain',
          }}
        />
      </Box>
      <Divider sx={{ borderColor: muiTheme.palette.divider }} />

      {/* Lista de Menu Principal */}
      <List sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
        {menuItems.map(item => (
          <ListItemButton
            key={item.id}
            selected={menu === item.id}
            onClick={() => {
              setMenu(item.id);
              if (isMobile) {
                handleDrawerToggle();
              }
            }}
            sx={{
              py: 1.5,
              '&.Mui-selected': {
                backgroundColor: muiTheme.palette.primary.main,
                '&:hover': {
                  backgroundColor: muiTheme.palette.primary.light,
                },
                '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                  color: muiTheme.palette.common.white,
                },
              },
              '&:hover': {
                backgroundColor: muiTheme.palette.action.hover,
              },
              color: muiTheme.palette.text.secondary,
            }}
          >
            <ListItemIcon sx={{ color: 'inherit', minWidth: '40px' }}>
              {item.label === "Clientes" && aniversariantesCount > 0 ? (
                <Badge
                  badgeContent={<CakeIcon sx={{ fontSize: '0.9rem', color: muiTheme.palette.error.main }} />}
                  color="error"
                  overlap="circular"
                  anchorOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                  sx={{
                    "& .MuiBadge-badge": {
                      backgroundColor: 'white',
                      border: `1px solid ${muiTheme.palette.error.main}`,
                      minWidth: '16px', height: '16px', padding: '0 2px'
                    }
                  }}
                >
                  {item.icon}
                </Badge>
              ) : (
                item.icon
              )}
            </ListItemIcon>
            <ListItemText primary={item.text} />
          </ListItemButton>
        ))}
      </List>

      {/* Seção de Aniversariantes (na parte de baixo) */}
      {aniversariantesCount > 0 && (
        <>
          <Divider sx={{ borderColor: muiTheme.palette.divider }} />
          <List dense sx={{ py: 0.5 }}>
            <ListItemButton
              onClick={() => {
                setMenu(0); // Navega para Clientes
                if (isMobile) {
                  handleDrawerToggle();
                }
              }}
              sx={{
                color: muiTheme.palette.warning.dark,
                '&:hover': {
                  backgroundColor: muiTheme.palette.action.hover,
                },
                py: 1,
              }}
            >
              <ListItemIcon sx={{ minWidth: '40px' }}>
                <Badge
                  badgeContent={aniversariantesCount}
                  color="error"
                  sx={{
                    "& .MuiBadge-badge": {
                      color: "white",
                      backgroundColor: muiTheme.palette.error.main
                    }
                  }}
                >
                  <CakeIcon sx={{ color: muiTheme.palette.warning.dark }} />
                </Badge>
              </ListItemIcon>
              <ListItemText primary={`Aniversariantes Hoje!`} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          </List>
        </>
      )}

      {/* Botão Sair (último item) */}
      <Divider sx={{ borderColor: muiTheme.palette.divider }} />
      <List dense sx={{ py: 0.5 }}>
        <ListItemButton
          onClick={onLogout}
          sx={{
            py: 1,
            color: muiTheme.palette.text.secondary,
            '&:hover': {
              backgroundColor: muiTheme.palette.action.hover,
            },
          }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: '40px' }}>
            <LogoutIcon />
          </ListItemIcon>
          <ListItemText primary="Sair" />
        </ListItemButton>
      </List>
    </Box>
  );

  return (
    <Drawer
      variant={isMobile ? "temporary" : "permanent"}
      open={isMobile ? mobileOpen : true}
      onClose={isMobile ? handleDrawerToggle : undefined}
      ModalProps={{
        keepMounted: true, // Important for SEO and performance by not re-rendering the drawer.
      }}
      sx={{
        display: { xs: isMobile ? 'block' : 'none', md: 'block' }, // Control display based on isMobile
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
            width: drawerWidth,
            boxSizing: 'border-box',
            boxShadow: '4px 0px 12px rgba(0,0,0,0.15)',
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
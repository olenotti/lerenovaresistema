import React from "react";
import { Drawer, List, ListItemIcon, ListItemText, ListItemButton, Typography, Box, Divider, useTheme, Badge } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import GroupIcon from "@mui/icons-material/Group";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarViewWeekIcon from "@mui/icons-material/CalendarViewWeek";
import CakeIcon from '@mui/icons-material/Cake';
import LogoutIcon from '@mui/icons-material/Logout';

const menuItems = [
  { label: "Agenda Visual", icon: <CalendarViewWeekIcon />, idx: 6 },
  { label: "Agendamentos", icon: <EventIcon />, idx: 2 },
  { label: "Controle de Atendimentos", icon: <HistoryEduIcon />, idx: 5 },
  { label: "Clientes", icon: <GroupIcon />, idx: 0 },
  { label: "Pacotes", icon: <AssignmentIndIcon />, idx: 1 },
  { label: "Consulta Cliente", icon: <PersonSearchIcon />, idx: 3 },
  { label: "Horários Fixos", icon: <AccessTimeIcon />, idx: 4 },
];

export default function SideMenu({ menu, setMenu, isMobile, mobileOpen, handleDrawerToggle, drawerWidth, onLogout, aniversariantesCount }) {
  const muiTheme = useTheme();
  const logoUrl = "https://assets.zyrosite.com/cdn-cgi/image/format=auto,w=544,fit=crop,q=95/Yanz3WRa3jIXbe26/comunicaassapso-visual-le-renovare-2-mp87zboQNzFJy8rV.png";

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', p: 1,
        // backgroundColor: muiTheme.palette.primary.dark, // Removido para fundo branco
        // color: 'white', // Removido
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
      <Divider sx={{ borderColor: muiTheme.palette.divider }} /> {/* Cor do divisor ajustada */}

      {/* Lista de Menu Principal */}
      <List sx={{ flexGrow: 1, overflowY: 'auto', py: 1 }}>
        {menuItems.sort((a, b) => a.idx - b.idx).map(item => (
          <ListItemButton
            key={item.idx}
            selected={menu === item.idx}
            onClick={() => {
              setMenu(item.idx);
              if (isMobile) {
                handleDrawerToggle();
              }
            }}
            sx={{
              py: 1.5, 
              '&.Mui-selected': {
                backgroundColor: muiTheme.palette.primary.main, // Fundo verde para selecionado
                '&:hover': {
                  backgroundColor: muiTheme.palette.primary.light,
                },
                '& .MuiListItemIcon-root, & .MuiListItemText-primary': {
                  color: muiTheme.palette.common.white, // Ícone e texto brancos quando selecionado
                },
              },
              '&:hover': {
                backgroundColor: muiTheme.palette.action.hover, // Hover para itens não selecionados
              },
              color: muiTheme.palette.text.secondary, // Cor do texto padrão dos itens (escuro)
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
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>

      {/* Seção de Aniversariantes (na parte de baixo) */}
      {aniversariantesCount > 0 && (
        <>
          <Divider sx={{ borderColor: muiTheme.palette.divider }} /> {/* Cor do divisor ajustada */}
          <List dense sx={{ py: 0.5 }}>
            <ListItemButton
              onClick={() => {
                setMenu(0); 
                if (isMobile) {
                  handleDrawerToggle();
                }
              }}
              sx={{
                color: muiTheme.palette.warning.dark, // Cor ajustada para fundo claro
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
                  <CakeIcon sx={{ color: muiTheme.palette.warning.dark }} /> {/* Cor do ícone ajustada */}
                </Badge>
              </ListItemIcon>
              <ListItemText primary={`Aniversariantes Hoje!`} primaryTypographyProps={{ variant: 'body2' }} />
            </ListItemButton>
          </List>
        </>
      )}

      {/* Botão Sair (último item) */}
      <Divider sx={{ borderColor: muiTheme.palette.divider }} /> {/* Cor do divisor ajustada */}
      <List dense sx={{ py: 0.5 }}>
        <ListItemButton
          onClick={onLogout}
          sx={{
            py: 1, 
            color: muiTheme.palette.text.secondary, // Cor ajustada para fundo claro
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
        keepMounted: true, 
      }}
      sx={{
        display: { xs: isMobile ? 'block' : 'none', md: 'block' }, 
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { 
            width: drawerWidth, 
            boxSizing: 'border-box',
            boxShadow: '4px 0px 12px rgba(0,0,0,0.15)', // Sombreado adicionado
        },
      }}
    >
      {drawerContent}
    </Drawer>
  );
}
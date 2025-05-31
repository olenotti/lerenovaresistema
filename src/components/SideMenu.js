import React from "react";
import { Drawer, List, ListItemIcon, ListItemText, ListItemButton, Typography, Box, Divider, useTheme } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import GroupIcon from "@mui/icons-material/Group";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarViewWeekIcon from "@mui/icons-material/CalendarViewWeek";
// import SettingsIcon from '@mui/icons-material/Settings'; // Se você tiver Configurações
// import logo from '../assets/logo_circulo_verde_escuro.png'; // Se você tiver um logo

const menuItems = [
  { label: "Agenda Visual", icon: <CalendarViewWeekIcon />, idx: 6 },
  { label: "Agendamentos", icon: <EventIcon />, idx: 2 },
  { label: "Controle de Atendimentos", icon: <HistoryEduIcon />, idx: 5 },
  { label: "Clientes", icon: <GroupIcon />, idx: 0 },
  { label: "Pacotes", icon: <AssignmentIndIcon />, idx: 1 },
  { label: "Consulta Cliente", icon: <PersonSearchIcon />, idx: 3 },
  { label: "Horários Fixos", icon: <AccessTimeIcon />, idx: 4 },
  // { label: "Configurações", icon: <SettingsIcon />, idx: 7 }, // Se existir
];

export default function SideMenu({ menu, setMenu, isMobile, mobileOpen, handleDrawerToggle, drawerWidth }) {
  const muiTheme = useTheme(); // Para usar o tema aqui

  const drawerContent = (
    <div>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2, 
                 backgroundColor: muiTheme.palette.primary.dark, /* Um pouco mais escuro para o header do drawer */
                 color: 'white', height: {xs: '56px', sm: '64px'} /* Altura do Toolbar */
                }}>
        {/* <img src={logo} alt="Le Renovare Logo" style={{ width: 32, height: 32, marginRight: 10 }} /> */}
        <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
          Le Renovare
        </Typography>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.12)'}} />
      <List>
        {menuItems.sort((a,b) => a.idx - b.idx).map(item => ( // Ordena pelo idx para garantir a ordem
          <ListItemButton
            key={item.idx}
            selected={menu === item.idx}
            onClick={() => {
              setMenu(item.idx);
              if (isMobile) { // Fecha o drawer ao selecionar um item em mobile
                handleDrawerToggle();
              }
            }}
            sx={{
              '&.Mui-selected': {
                backgroundColor: muiTheme.palette.primary.main, // Cor de seleção
                '&:hover': {
                  backgroundColor: muiTheme.palette.primary.light, // Hover na seleção
                },
              },
              '&:hover': {
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
              },
              color: muiTheme.palette.common.white, // Cor do texto dos itens
            }}
          >
            <ListItemIcon sx={{ color: muiTheme.palette.grey[300] /* Cor dos ícones */ }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{
          keepMounted: true, // Melhor performance de abertura em mobile.
        }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', md: 'block' },
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
      }}
      open // Drawer permanente está sempre aberto em desktop
    >
      {drawerContent}
    </Drawer>
  );
}
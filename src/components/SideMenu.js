// filepath: /Users/caio/Desktop/lerenovare/lerenovare/meu-app-react/src/components/SideMenu.js
import React from "react";
import { List, ListItemIcon, ListItemText, ListItemButton } from "@mui/material"; // Importar ListItemButton
// ... seus outros imports de ícones ...
import EventIcon from "@mui/icons-material/Event";
import GroupIcon from "@mui/icons-material/Group";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarViewWeekIcon from "@mui/icons-material/CalendarViewWeek";

const menuItems = [
  { label: "Clientes", icon: <GroupIcon />, idx: 0 },
  { label: "Pacotes", icon: <AssignmentIndIcon />, idx: 1 },
  { label: "Agendamentos", icon: <EventIcon />, idx: 2 },
  { label: "Consulta Cliente", icon: <PersonSearchIcon />, idx: 3 },
  { label: "Horários Fixos", icon: <AccessTimeIcon />, idx: 4 },
  { label: "Controle de Atendimentos", icon: <HistoryEduIcon />, idx: 5 },
  { label: "Agenda Visual", icon: <CalendarViewWeekIcon />, idx: 6 },
];

export default function SideMenu({ menu, setMenu }) {
  return (
    <nav>
      <List>
        {menuItems.map(item => (
          <ListItemButton // Usar ListItemButton
            key={item.idx}
            selected={menu === item.idx}
            onClick={() => setMenu(item.idx)}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
    </nav>
  );
}
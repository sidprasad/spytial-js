int: n_colors;
int: n_regions;
int: n_borders;
array[1..n_borders] of int: from_region;
array[1..n_borders] of int: to_region;

array[1..n_regions] of var 1..n_colors: color;
constraint forall(e in 1..n_borders)(
  color[from_region[e]] != color[to_region[e]]
);
% Fix WA and the disconnected island T to remove some equivalent solutions.
constraint color[1] = 1;
constraint color[7] = 1;
solve satisfy;

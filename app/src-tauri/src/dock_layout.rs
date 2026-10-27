//! Keep a small video inside the current client area during resize/DPI transitions.
pub fn inside(rect: [i32;4], width:i32, height:i32)->Option<[i32;4]>{
 if width<1||height<1||rect[2]<1||rect[3]<1{return None;}
 let w=rect[2].min(width);let h=rect[3].min(height);
 // A dock sliding off the bottom (web video) keeps its own top while that top is still in the window: the child
 // window is clipped by the parent, so the video slides out with the dock instead of sticking to the bottom edge.
 let y=if rect[1]>height-h&&rect[1]<height{rect[1]}else{rect[1].clamp(0,height-h)};
 Some([rect[0].clamp(0,width-w),y,w,h])
}
#[cfg(test)]mod tests{use super::*;
 #[test]fn stale_fullscreen_coordinates_stay_small(){assert_eq!(inside([43,1239,220,124],960,640),Some([43,516,220,124]));}
 #[test]fn dpi_and_tiny_window_are_bounded(){assert_eq!(inside([3000,-2,220,124],180,100),Some([0,0,180,100]));assert_eq!(inside([i32::MAX,i32::MAX,220,124],960,640),Some([740,516,220,124]));}
 #[test]fn sliding_dock_leaves_through_the_bottom(){assert_eq!(inside([43,600,220,124],960,640),Some([43,600,220,124]));}
 #[test]fn minimized_window_is_not_a_fullscreen_request(){assert_eq!(inside([43,500,220,124],0,0),None);assert_eq!(inside([43,500,0,124],960,640),None);}
}

const MARGIN=12,GAP=10,MIN_SIDE_WIDTH=260;
const clamp=(value,min,max)=>Math.min(Math.max(value,min),max);

/** Place a fixed tooltip outside its icon, above the persistent statistics. */
export function researchTooltipPlacement({anchor,width=370,height=300,viewportWidth,viewportHeight,bottomLimit}={}){
  const vw=Math.max(1,Number(viewportWidth)||1),vh=Math.max(1,Number(viewportHeight)||1);
  const rightEdge=Math.max(MARGIN,vw-MARGIN),bottomEdge=Math.max(MARGIN,vh-MARGIN);
  const bottom=Number.isFinite(bottomLimit)&&bottomLimit>MARGIN&&bottomLimit<=bottomEdge?bottomLimit:bottomEdge;
  const requestedWidth=Math.max(1,Number(width)||370),naturalHeight=Math.max(0,Number(height)||0);
  const desiredWidth=Math.min(requestedWidth,Math.max(0,rightEdge-MARGIN));
  const availableHeight=Math.max(0,bottom-MARGIN);
  const left=Number.isFinite(anchor?.left)?anchor.left:MARGIN;
  const right=Number.isFinite(anchor?.right)?Math.max(left,anchor.right):left;
  const top=Number.isFinite(anchor?.top)?anchor.top:MARGIN;
  const iconBottom=Number.isFinite(anchor?.bottom)?Math.max(top,anchor.bottom):top;
  const leftSpace=Math.max(0,left-GAP-MARGIN),rightSpace=Math.max(0,rightEdge-right-GAP);

  // A phone uses vertical placement even if one side narrowly fits a card.
  // On larger screens try both sides at full width before shrinking the card.
  if(vw>=600){
    let side=null,placedWidth=desiredWidth;
    if(leftSpace>=desiredWidth)side='left';
    else if(rightSpace>=desiredWidth)side='right';
    else if(leftSpace>=MIN_SIDE_WIDTH){side='left';placedWidth=Math.min(desiredWidth,leftSpace);}
    else if(rightSpace>=MIN_SIDE_WIDTH){side='right';placedWidth=Math.min(desiredWidth,rightSpace);}
    if(side){
      const placedHeight=Math.min(naturalHeight,availableHeight);
      const placedTop=clamp(top,MARGIN,bottom-placedHeight);
      return {left:side==='left'?left-GAP-placedWidth:right+GAP,top:placedTop,width:placedWidth,maxHeight:Math.max(0,bottom-placedTop)};
    }
  }

  const above=Math.max(0,Math.min(top-GAP,bottom)-MARGIN);
  const below=Math.max(0,bottom-Math.max(iconBottom+GAP,MARGIN));
  const useAbove=above>below,space=useAbove?above:below;
  const placedHeight=Math.min(naturalHeight,space);
  const placedTop=useAbove?Math.min(top-GAP,bottom)-placedHeight:Math.max(iconBottom+GAP,MARGIN);
  return {
    left:clamp((left+right-desiredWidth)/2,MARGIN,rightEdge-desiredWidth),
    top:clamp(placedTop,MARGIN,bottom),
    width:desiredWidth,
    // Above the icon the height must stop at the gap, even if wrapping adds
    // lines after the browser applies the returned narrower width.
    maxHeight:useAbove?placedHeight:space,
  };
}
